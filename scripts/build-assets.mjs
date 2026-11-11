// Builds the pictures of the profile README from the media of the xrtem.dev checkout.
//
//   node scripts/build-assets.mjs /path/to/xrtem.dev [--only=banner,work-serbeke]
//
// Needs the site's own node_modules (puppeteer-core, sharp), Google Chrome, ffmpeg and img2webp.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SITE = path.resolve(process.argv[2] ?? "");
if (!fs.existsSync(path.join(SITE, "public/media/work"))) {
  console.error("usage: node scripts/build-assets.mjs /path/to/xrtem.dev [--only=a,b]");
  process.exit(1);
}
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const wanted = (name) => !only || only.includes(name);

const require = createRequire(path.join(SITE, "package.json"));
const puppeteer = require("puppeteer-core");
const sharp = require("sharp");

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "readme-assets-"));
const MEDIA = path.join(SITE, "public/media");
const media = (p) => pathToFileURL(path.join(MEDIA, p)).href;
fs.mkdirSync(OUT, { recursive: true });

// Every picture is a dark card with a hairline edge and a glow in the colour of the project.
// G is the transparent gutter baked around a card, so that cards set side by side get even gaps.
const G = 10;
const css = `
  @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Onest:wght@400;500;600&display=block");
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; }
  body { position: relative; overflow: hidden; font-family: Onest, system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  .card { position: absolute; inset: ${G}px; border-radius: 36px; overflow: hidden; background: #0b0a10; }
  .card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(90% 70% at 88% -8%, var(--glow), transparent 68%); opacity: .34; }
  .card::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.1); pointer-events: none; z-index: 5; }
  .no { position: absolute; font: 400 24px/1 "JetBrains Mono", monospace; color: rgba(255,255,255,.42); letter-spacing: .02em; }
  .go { position: absolute; width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center;
    background: rgba(255,255,255,.08); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.12); }
  .go svg { width: 22px; height: 22px; }
  h1 { position: absolute; font-weight: 500; letter-spacing: -.04em; line-height: 1; white-space: nowrap; }
  .kind { position: absolute; font-weight: 400; color: rgba(255,255,255,.62); letter-spacing: -.01em; white-space: nowrap; }
  .stack { position: absolute; font-family: "JetBrains Mono", monospace; font-weight: 400; color: rgba(255,255,255,.4); white-space: nowrap; }
  .shot { position: absolute; overflow: hidden; background: #111; box-shadow: 0 0 0 1.5px rgba(255,255,255,.1), 0 40px 90px rgba(0,0,0,.55); }
  .shot img { display: block; width: 100%; }
`;
const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>`;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();

/** Renders a body of the given size; returns a PNG path, or writes assets/<name>.webp. */
async function render(name, width, height, body, { png = false, scale = 1 } = {}) {
  const file = path.join(TMP, `${name}.html`);
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css} body{width:${width}px;height:${height}px}</style>${body}`);
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ omitBackground: true, type: "png" });
  if (png) {
    const out = path.join(TMP, `${name}.png`);
    fs.writeFileSync(out, shot);
    return out;
  }
  await sharp(shot).webp({ quality: 86, alphaQuality: 92, effort: 6 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(name);
}

// --- Banner: a still of the chrome star from the site's hero with the wordmark over it.
if (wanted("banner")) {
  const star = path.join(TMP, "star.png");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "13.5", "-i", path.join(MEDIA, "metalab/desktop.mp4"), "-frames:v", "1", star]);
  await render("banner", 1600, 620, `
    <div class="card" style="--glow:transparent;background:#04030a">
      <img src="${pathToFileURL(star).href}" style="position:absolute;right:-70px;top:-120px;width:1180px">
      <div style="position:absolute;inset:0;background:linear-gradient(90deg,#04030a 0%,rgba(4,3,10,.86) 26%,rgba(4,3,10,0) 62%),linear-gradient(0deg,rgba(4,3,10,.75),rgba(4,3,10,0) 45%)"></div>
      <div class="no" style="left:64px;top:60px">xrtem.dev</div>
      <div class="no" style="right:64px;top:60px">62.03° N · 129.73° E</div>
      <h1 style="left:56px;bottom:150px;font-size:236px">xrtem</h1>
      <div class="kind" style="left:66px;bottom:66px;font-size:38px;color:#fff">Артём Свинобоев<span style="color:rgba(255,255,255,.55)"> — fullstack-разработчик из Якутска</span></div>
    </div>`);
}

// --- Project cards: the name, what it is, the stack, and the page itself cut by the bottom edge.
const W = 1200, H = 960;
const head = (no, name, kind, stack) => `
  <div class="no" style="left:64px;top:62px">${no}</div>
  <div class="go" style="right:54px;top:44px">${arrow}</div>
  <h1 style="left:60px;top:128px;font-size:96px">${name}</h1>
  <div class="kind" style="left:64px;top:250px;font-size:33px">${kind}</div>
  <div class="stack" style="left:64px;top:312px;font-size:23px">${stack.join(" · ")}</div>`;

const sites = [
  ["serbeke", "02", "Сэрбэкэ", "Меховой салон · сайт и запись на примерку", ["Next.js", "React", "TypeScript", "Tailwind"], "#d9a441", "work/serbeke/scroll-poster.webp"],
  ["profcosmetic", "03", "Профкосметик", "Интернет-магазин профессиональной косметики", ["Next.js", "React"], "#ff5c8a", "work/profcosmetic/home.webp"],
  ["chinatradeco", "04", "ChinaTradeCo", "Байер-сервис · товары из Китая", ["Vite", "React", "Tailwind", "Telegram Mini App", "Django", "PostgreSQL"], "#ff4d3d", "work/chinatradeco/scroll-poster.webp"],
  ["dpo-imi", "06", "ДПО ИМИ", "Веб-приложение · дополнительное образование", ["SvelteKit", "Python", "FastAPI", "PostgreSQL", "Celery"], "#6a5cff", "work/dpo-imi/scroll-poster.webp"],
  ["chaseje", "07", "Chase.je", "Частный бутик · имиджевый сайт", ["HTML", "CSS", "JavaScript"], "#c08a52", "work/chaseje/scroll-poster.webp"],
];
for (const [id, no, name, kind, stack, glow, src] of sites) {
  if (!wanted(`work-${id}`)) continue;
  await render(`work-${id}`, W, H, `
    <div class="card" style="--glow:${glow}">${head(no, name, kind, stack)}
      <div class="shot" style="left:64px;right:64px;top:400px;height:700px;border-radius:20px"><img src="${media(src)}"></div>
    </div>`);
}

/** A bare app screen: no device around it, the status bar cropped away. */
const screen = (x, y, w, src, cropTop, extra = "") =>
  `<div class="shot" style="left:${x}px;top:${y}px;width:${w}px;height:1400px;border-radius:${Math.round(w * 0.075)}px;${extra}">
     <img src="${media(src)}" style="margin-top:-${Math.round(w * cropTop)}px"></div>`;

// СтудМаркет lives inside Telegram: three of its screens instead of a page.
if (wanted("work-studmarket")) {
  await render("work-studmarket", W, H, `
    <div class="card" style="--glow:#2f8fff">${head("05", "СтудМаркет", "Telegram Mini App · сервис доставки", ["Python", "FastAPI", "aiogram", "PostgreSQL", "React", "TypeScript"])}
      ${screen(64, 470, 330, "work/studmarket/order.webp", 0.04)}
      ${screen(782, 470, 330, "work/studmarket/dark-home.webp", 0.12)}
      ${screen(408, 400, 360, "work/studmarket/home.webp", 0.12)}
    </div>`);
}

// --- Hackathon apps: one screen each.
const hacks = [
  ["sweet-bridge", "Сладкий мост", "Peak IT 2026", "#ff8a3d", "work/hackathons/sweet-bridge/02-home.webp"],
  ["sahatyja", "СахаТыа", "ГИС-IT 2026", "#4fd08a", "work/hackathons/sahatyja/01-feed.webp"],
  ["oculus", "Oculus-Feldsher", "Февраль 2026", "#4aa8ff", "work/hackathons/medical/02-patients.webp"],
];
for (const [id, name, event, glow, src] of hacks) {
  if (!wanted(`hack-${id}`)) continue;
  await render(`hack-${id}`, 800, 1000, `
    <div class="card" style="--glow:${glow}">
      <div class="no" style="left:56px;top:58px">${event}</div>
      <h1 style="left:53px;top:112px;font-size:74px">${name}</h1>
      <div class="stack" style="left:56px;top:212px;font-size:22px">Expo · React Native</div>
      ${screen(140, 320, 500, src, 0.128)}
    </div>`);
}

// --- SAQAOMUK: a wide card with the recording of the live site playing in it.
if (wanted("hero")) {
  const S = 0.85, CW = 1600, CH = 720, VX = 716, VY = 110, VW = 800, VH = 500, FPS = 10;
  const px = (n) => Math.round(n * S);
  const frame = await render("hero-frame", CW, CH, `
    <div class="card" style="--glow:#2f7dff">
      <div class="no" style="left:64px;top:62px">01</div>
      <h1 style="left:59px;top:150px;font-size:98px">SAQAOMUK</h1>
      <div class="kind" style="left:64px;top:270px;font-size:33px">Fashion · интернет-магазин</div>
      <div class="kind" style="left:64px;top:356px;font-size:28px;line-height:1.42;width:560px;white-space:normal;color:rgba(255,255,255,.5)">Онлайн-магазин бренда: коллекции, каталог, оформление заказов и интеграции с учётными системами.</div>
      <div class="stack" style="left:64px;bottom:62px;font-size:23px">React · Vite</div>
      <div class="shot" style="left:${VX - G}px;top:${VY - G}px;width:${VW}px;height:${VH}px;border-radius:20px"></div>
    </div>`, { png: true, scale: S });
  const cut = (name, w, h, r) => render(name, w, h,
    `<div style="position:absolute;inset:0;background:#000"><div style="position:absolute;inset:0;border-radius:${r}px;background:#fff"></div></div>`, { png: true, scale: S });
  const vmask = await cut("hero-vmask", VW, VH, 20);
  const frames = path.join(TMP, "frames");
  fs.mkdirSync(frames);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", path.join(MEDIA, "work/saqaomuk/scroll.mp4"),
    "-loop", "1", "-t", "16", "-i", frame,
    "-loop", "1", "-t", "16", "-i", vmask,
    "-filter_complex",
    `[0]fps=${FPS},scale=${px(VW)}:${px(VH)}:flags=lanczos,format=rgb24[v];[2]format=gray[m];[v][m]alphamerge[vr];` +
    `[1][vr]overlay=${px(VX)}:${px(VY)}:shortest=1:format=auto[o]`,
    // The stills loop for a bounded time only; the hard caps keep a filter mistake from filling the disk.
    "-map", "[o]", "-t", "16", "-frames:v", String(FPS * 17), path.join(frames, "%04d.png"),
  ], { stdio: "inherit" });
  // ffmpeg here is built without libwebp, so the frames are joined by img2webp.
  execFileSync("img2webp", [
    "-loop", "0", "-lossy", "-q", "62", "-m", "4", "-d", String(Math.round(1000 / FPS)),
    ...fs.readdirSync(frames).sort().map((f) => path.join(frames, f)),
    "-o", path.join(OUT, "hero.webp"),
  ], { stdio: "inherit" });
  console.log("hero");
}
await browser.close();

fs.rmSync(TMP, { recursive: true, force: true });
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB");
