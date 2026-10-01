#!/usr/bin/env python3
"""Builds the artwork for the profile README: assets/*.svg

Everything is drawn as outlines, because an SVG shown through <img> on GitHub
cannot load web fonts. Text is shaped with HarfBuzz (so kerning survives) and
turned into <path> data; the motion is plain SMIL, which GitHub serves as is.

    python -m venv .venv && .venv/bin/pip install fonttools brotli uharfbuzz
    .venv/bin/python scripts/build_assets.py --fonts PATH/TO/WOFF2_DIR

--fonts is any folder holding the Cormorant Garamond, Onest and JetBrains Mono
files (woff2 or ttf, subsets welcome — glyphs are looked up per character).
All three families are SIL OFL. The xrtem.dev build keeps them in
.next/static/media.
"""
from __future__ import annotations

import argparse
import glob
import io
import os
import sys

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

INK = "#07060B"
GLOW = "#5B46FF"
MUTED = "#A9A7B4"
SOFT = "#D9D7E3"


# --------------------------------------------------------------------- fonts


class Face:
    def __init__(self, path: str):
        font = TTFont(path)
        name = font["name"]
        self.family = name.getDebugName(1) or ""
        self.italic = (name.getDebugName(2) or "").lower().startswith("italic")
        self.cmap = font.getBestCmap()
        self.upem = font["head"].unitsPerEm
        self.glyphs = font.getGlyphSet()
        self.order = font.getGlyphOrder()
        buffer = io.BytesIO()
        font.flavor = None
        font.save(buffer)
        self.hb = hb.Font(hb.Face(buffer.getvalue()))


class Fonts:
    def __init__(self, folder: str):
        self.faces: list[Face] = []
        for path in sorted(glob.glob(os.path.join(folder, "*.woff2")) + glob.glob(os.path.join(folder, "*.ttf"))):
            try:
                self.faces.append(Face(path))
            except Exception:  # not a font we can read: skip it
                continue
        if not self.faces:
            sys.exit(f"no fonts found in {folder}")

    def stack(self, family: str, italic: bool = False) -> list[Face]:
        found = [f for f in self.faces if f.family.startswith(family) and f.italic == italic]
        if not found:
            sys.exit(f"missing font: {family} italic={italic}")
        return found


def _face_for(stack: list[Face], char: str, prefer: Face | None) -> Face:
    cp = ord(char)
    if prefer is not None and cp in prefer.cmap:
        return prefer
    for face in stack:
        if cp in face.cmap:
            return face
    sys.exit(f"no glyph for {char!r} ({cp:#06x}) in {stack[0].family}")


class Type:
    """One style of text: a font stack, a size and a tracking in em."""

    def __init__(self, stack: list[Face], size: float, tracking: float = 0.0):
        self.stack, self.size, self.tracking = stack, size, tracking

    def _runs(self, text: str):
        runs, prefer = [], None
        for char in text:
            face = _face_for(self.stack, char, prefer)
            prefer = face
            if runs and runs[-1][0] is face:
                runs[-1][1].append(char)
            else:
                runs.append((face, [char]))
        return [(face, "".join(chars)) for face, chars in runs]

    def layout(self, text: str):
        """[(face, glyph id, x offset, y offset, pen x)] and the total width, in px."""
        out, pen = [], 0.0
        for face, run in self._runs(text):
            scale = self.size / face.upem
            buf = hb.Buffer()
            buf.add_str(run)
            buf.guess_segment_properties()
            hb.shape(face.hb, buf, {"kern": True, "liga": False})
            for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
                out.append((face, info.codepoint, pos.x_offset * scale, pos.y_offset * scale, pen))
                pen += pos.x_advance * scale + self.tracking * self.size
        return out, pen - self.tracking * self.size if out else 0.0

    def width(self, text: str) -> float:
        return self.layout(text)[1]

    def path(self, text: str, x: float, y: float, anchor: str = "start") -> str:
        glyphs, width = self.layout(text)
        if anchor == "end":
            x -= width
        elif anchor == "middle":
            x -= width / 2
        d = []
        for face, gid, xo, yo, pen_x in glyphs:
            scale = self.size / face.upem
            sink = SVGPathPen(face.glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
            pen = TransformPen(sink, (scale, 0, 0, -scale, x + pen_x + xo, y - yo))
            face.glyphs[face.order[gid]].draw(pen)
            d.append(sink.getCommands())
        return "".join(d)


# ----------------------------------------------------------------------- svg


def svg(width: int, height: int, title: str, body: str, defs: str = "") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'role="img" aria-label="{title}">\n<title>{title}</title>\n<defs>\n{defs}\n</defs>\n{body}\n</svg>\n'
    )


def radial(id_: str, color: str, alpha: float) -> str:
    return (
        f'<radialGradient id="{id_}"><stop offset="0" stop-color="{color}" stop-opacity="{alpha}"/>'
        f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>'
    )


def drift(values: list[tuple[int, int]], dur: float) -> str:
    """A slow loop through a few offsets, eased, for a glow that breathes."""
    pts = values + [values[0]]
    vs = ";".join(f"{x} {y}" for x, y in pts)
    n = len(pts)
    times = ";".join(f"{i / (n - 1):.3f}" for i in range(n))
    splines = ";".join(["0.45 0 0.55 1"] * (n - 1))
    return (
        f'<animateTransform attributeName="transform" type="translate" dur="{dur}s" repeatCount="indefinite" '
        f'calcMode="spline" keyTimes="{times}" keySplines="{splines}" values="{vs}"/>'
    )


def arrow(x: float, y: float, size: float, color: str, stroke: float = 2.4, nudge: bool = True) -> str:
    """The ↗ the site uses, drawn as a stroke so it needs no glyph."""
    s = size
    d = f"M{x:.1f} {y + s:.1f} L{x + s:.1f} {y:.1f} M{x + s * 0.28:.1f} {y:.1f} H{x + s:.1f} V{y + s * 0.72:.1f}"
    motion = (
        '<animateTransform attributeName="transform" type="translate" dur="2.6s" repeatCount="indefinite" '
        'calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" values="0 0;5 -5;0 0"/>'
        if nudge
        else ""
    )
    return (
        f'<g fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="{d}">{motion}</path></g>'
    )


# -------------------------------------------------------------------- banner

WORDS = ["открывают", "листают", "покупают", "показывают", "советуют"]
CYCLE = 15.0  # seconds for the whole list


def cycling_word(path_d: str, i: int, n: int) -> str:
    """One word: it rises in, holds, then lifts out as the next one arrives."""
    window = 1.0 / n
    start, end = i * window, (i + 1) * window
    fade = 0.035
    if i == 0:
        times = [0.0, end - fade, end, 1 - fade, 1.0]
        opacity = [1, 1, 0, 0, 1]
        shift = [0, 0, -24, 36, 0]
    else:
        times = [0.0, start - fade, start, end - fade, end]
        opacity = [0, 0, 1, 1, 0]
        shift = [36, 36, 0, 0, -24]
        if end < 1.0:
            times.append(1.0)
            opacity.append(0)
            shift.append(-24)
    kt = ";".join(f"{t:.4f}" for t in times)
    ks = ";".join(["0.16 1 0.3 1"] * (len(times) - 1))
    ov = ";".join(str(o) for o in opacity)
    tv = ";".join(f"0 {s}" for s in shift)
    return (
        f'<g opacity="{1 if i == 0 else 0}">'
        f'<animate attributeName="opacity" dur="{CYCLE}s" repeatCount="indefinite" calcMode="spline" keyTimes="{kt}" keySplines="{ks}" values="{ov}"/>'
        f'<animateTransform attributeName="transform" type="translate" dur="{CYCLE}s" repeatCount="indefinite" calcMode="spline" keyTimes="{kt}" keySplines="{ks}" values="{tv}"/>'
        f'<path fill="#fff" d="{path_d}"/></g>'
    )


def banner(fonts: Fonts) -> str:
    W, H = 1280, 500
    display = Type(fonts.stack("Cormorant"), 122, -0.03)
    italic = Type(fonts.stack("Cormorant", italic=True), 122, -0.03)
    onest = Type(fonts.stack("Onest"), 32, -0.045)
    mono = Type(fonts.stack("JetBrains"), 17, 0.04)

    x0, line1, line2 = 64, 268, 268 + 112
    first = display.path("Делаю сайты,", x0, line1)
    second = display.path("которые", x0, line2)
    word_x = x0 + display.width("которые ") + 2
    words = "".join(cycling_word(italic.path(w, word_x, line2), i, len(WORDS)) for i, w in enumerate(WORDS))

    defs = "\n".join(
        [
            radial("g1", GLOW, 0.62),
            radial("g2", "#2A1F7A", 0.8),
            radial("g3", "#9A97A8", 0.26),
            f'<clipPath id="card"><rect width="{W}" height="{H}" rx="22"/></clipPath>',
            '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.0"/>'
            '<stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>',
        ]
    )
    body = f"""<g clip-path="url(#card)">
<rect width="{W}" height="{H}" fill="{INK}"/>
<g><ellipse cx="900" cy="150" rx="520" ry="300" fill="url(#g1)"/>{drift([(0, 0), (-150, 70), (90, -40)], 22)}</g>
<g><ellipse cx="260" cy="470" rx="470" ry="260" fill="url(#g2)"/>{drift([(0, 0), (160, -60), (-60, 30)], 27)}</g>
<g><ellipse cx="1120" cy="430" rx="360" ry="220" fill="url(#g3)"/>{drift([(0, 0), (-190, -40), (40, 50)], 19)}</g>
<rect width="{W}" height="{H}" fill="url(#fade)"/>
<path fill="#fff" d="{onest.path('xrtem', x0, 76)}"/>
<path fill="{MUTED}" d="{mono.path('YKS · ЯКУТСК · UTC+9', W - x0, 74, 'end')}"/>
<path fill="#fff" d="{first}"/>
<path fill="#fff" d="{second}"/>
{words}
<path fill="{MUTED}" d="{mono.path('(FULLSTACK · ML/CV)', x0, H - 46)}"/>
<circle cx="{W - x0 - mono.width('ОТКРЫТ К ПРОЕКТАМ') - 22}" cy="{H - 52}" r="4.5" fill="#fff"><animate attributeName="opacity" values="0.3;1;0.3" dur="2.4s" repeatCount="indefinite"/></circle>
<path fill="{MUTED}" d="{mono.path('ОТКРЫТ К ПРОЕКТАМ', W - x0, H - 46, 'end')}"/>
</g>
<rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="21.5" fill="none" stroke="#fff" stroke-opacity="0.09"/>"""
    return svg(W, H, "xrtem — Делаю сайты, которые открывают, листают, покупают, показывают, советуют", body, defs)


# ------------------------------------------------------------------ work rows

WORKS = [
    dict(
        file="work-saqaomuk.svg", index="01", title="SAQAOMUK", kind="FASHION · ВИТРИНА", domain="saqaomuk.com",
        bg="#145b99", fg="#ffffff", sub="#cfe2f3", wash="#4aa3ff",
        label="SAQAOMUK — интернет-магазин бренда одежды, saqaomuk.com",
    ),
    dict(
        file="work-chaseje.svg", index="02", title="Chase.je", kind="ЧАСТНЫЙ БУТИК · ИМИДЖЕВЫЙ САЙТ", domain="chaseje.com",
        bg="#302b28", fg="#eee6d8", sub="#b3a998", wash="#a79b8a",
        label="Chase.je — имиджевый сайт частного бутика-архива, chaseje.com",
    ),
    dict(
        file="work-profcosmetic.svg", index="03", title="PROFCOSMETIC", kind="БИЗНЕС-СИСТЕМА · АНАЛИТИКА", domain="profcosmetic.dev",
        bg="#eee6df", fg="#322732", sub="#776e67", wash="#a53f34",
        label="PROFCOSMETIC — аналитика владельца с интеграцией 1С, profcosmetic.dev",
    ),
]


def work_row(fonts: Fonts, work: dict) -> tuple[str, str]:
    W, H = 1280, 200
    title = Type(fonts.stack("Cormorant"), 112, -0.035)
    mono = Type(fonts.stack("JetBrains"), 18, 0.1)
    domain = Type(fonts.stack("JetBrains"), 21, 0.02)
    pad = 48
    arrow_size = 20
    domain_x = W - pad - arrow_size - 16
    defs = "\n".join(
        [
            radial("wash", work["wash"], 0.34),
            f'<clipPath id="row"><rect width="{W}" height="{H}" rx="14"/></clipPath>',
        ]
    )
    body = f"""<g clip-path="url(#row)">
<rect width="{W}" height="{H}" fill="{work['bg']}"/>
<g><ellipse cx="900" cy="100" rx="430" ry="190" fill="url(#wash)"/>{drift([(-420, 0), (260, 14), (-420, 0)], 15)}</g>
<path fill="{work['sub']}" d="{mono.path(work['index'], pad, 56)}"/>
<path fill="{work['sub']}" d="{mono.path(work['kind'], W - pad, 56, 'end')}"/>
<path fill="{work['fg']}" d="{title.path(work['title'], pad - 3, 160)}"/>
<path fill="{work['fg']}" d="{domain.path(work['domain'], domain_x, 160, 'end')}"/>
{arrow(W - pad - arrow_size, 142 - 4, arrow_size, work['fg'])}
</g>"""
    return work["file"], svg(W, H, work["label"], body, defs)


# --------------------------------------------------------------------- footer


def footer(fonts: Fonts) -> str:
    W, H = 1280, 340
    display = Type(fonts.stack("Cormorant"), 118, -0.035)
    italic = Type(fonts.stack("Cormorant", italic=True), 118, -0.035)
    mono = Type(fonts.stack("JetBrains"), 17, 0.04)
    x0 = 64
    shine_w = 900
    defs = "\n".join(
        [
            radial("g1", GLOW, 0.5),
            radial("g2", "#2A1F7A", 0.75),
            f'<clipPath id="card"><rect width="{W}" height="{H}" rx="22"/></clipPath>',
            f'<linearGradient id="shine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{shine_w}" y2="0" spreadMethod="repeat">'
            '<stop offset="0" stop-color="#7f7c8c"/><stop offset="0.33" stop-color="#ffffff"/>'
            '<stop offset="0.5" stop-color="#d9d6ff"/><stop offset="1" stop-color="#7f7c8c"/>'
            f'<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="{shine_w} 0" dur="4.5s" repeatCount="indefinite"/>'
            "</linearGradient>",
            f'<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GLOW}"/><stop offset="1" stop-color="#fff"/></linearGradient>',
        ]
    )
    cx, cy, r = W - 64 - 56, 210, 56
    body = f"""<g clip-path="url(#card)">
<rect width="{W}" height="{H}" fill="{INK}"/>
<g><ellipse cx="1000" cy="260" rx="520" ry="260" fill="url(#g1)"/>{drift([(0, 0), (-170, -40), (60, 30)], 21)}</g>
<g><ellipse cx="180" cy="40" rx="440" ry="240" fill="url(#g2)"/>{drift([(0, 0), (150, 60), (-40, 90)], 25)}</g>
<path fill="{SOFT}" d="{mono.path('(КОНТАКТЫ)', x0, 70)}"/>
<path fill="#fff" d="{display.path('Есть проект?', x0, 192)}"/>
<path fill="url(#shine)" d="{italic.path('Поговорим.', x0, 192 + 108)}"/>
<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff"/>
<circle cx="{cx}" cy="{cy}" r="{r + 9}" fill="none" stroke="url(#ring)" stroke-width="2.4" stroke-dasharray="70 270" stroke-linecap="round">
<animateTransform attributeName="transform" type="rotate" from="0 {cx} {cy}" to="360 {cx} {cy}" dur="3.2s" repeatCount="indefinite"/></circle>
<g transform="translate({cx - 14} {cy - 14})">{arrow(0, 0, 28, INK, 2.8)}</g>
<path fill="{MUTED}" d="{mono.path('XRTEM.DEV · T.ME/STELMAHHH', W - 64, H - 40, 'end')}"/>
</g>
<rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="21.5" fill="none" stroke="#fff" stroke-opacity="0.09"/>"""
    return svg(W, H, "Есть проект? Поговорим. xrtem.dev", body, defs)


# ------------------------------------------------------------------------ main


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fonts", required=True, help="folder with the font files")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "assets"))
    args = parser.parse_args()

    fonts = Fonts(args.fonts)
    os.makedirs(args.out, exist_ok=True)

    files = {"banner.svg": banner(fonts), "footer.svg": footer(fonts)}
    for work in WORKS:
        name, content = work_row(fonts, work)
        files[name] = content

    for name, content in files.items():
        path = os.path.join(args.out, name)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
        print(f"{name:24s} {len(content) / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
