// Builds the pictures of the profile README from the media of the xrtem.dev checkout.
//
//   node scripts/build-assets.mjs /path/to/xrtem.dev
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
  console.error("usage: node scripts/build-assets.mjs /path/to/xrtem.dev");
  process.exit(1);
}
const require = createRequire(path.join(SITE, "package.json"));
const puppeteer = require("puppeteer-core");
const sharp = require("sharp");

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "readme-assets-"));
const media = (p) => pathToFileURL(path.join(SITE, "public/media/work", p)).href;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const EDGE = "rgba(128,128,128,.45)";
const css = `
  @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Onest:wght@400;500;600&display=block");
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; }
  body { position: relative; overflow: hidden; font-family: Onest, system-ui, sans-serif; }
  .win { position: absolute; border-radius: 22px; overflow: hidden; box-shadow: inset 0 0 0 1.5px ${EDGE}; background: #17161d; }
  .win::after { content: ""; position: absolute; inset: 0; border-radius: 22px; box-shadow: inset 0 0 0 1.5px ${EDGE}; pointer-events: none; }
  .bar { display: flex; align-items: center; gap: 10px; padding: 0 22px; background: #17161d; }
  .bar i { width: 13px; height: 13px; border-radius: 50%; background: #3b3a46; }
  .bar span { position: absolute; left: 50%; transform: translateX(-50%); padding: 7px 26px; border-radius: 99px;
    background: rgba(255,255,255,.07); color: #a9a7b4; font: 400 19px/1 "JetBrains Mono", monospace; white-space: nowrap; }
  .win img, .phone img { display: block; width: 100%; }
  .phone { position: absolute; padding: 9px; background: #0b0b0f; box-shadow: 0 0 0 1.5px ${EDGE}, 0 18px 40px rgba(0,0,0,.32); }
  .phone img { height: 100%; object-fit: cover; object-position: top; }
`;

const win = (x, y, w, barH, label, src) =>
  `<div class="win" style="left:${x}px;top:${y}px;width:${w}px">
     <div class="bar" style="height:${barH}px"><i></i><i></i><i></i><span>${label}</span></div>
     ${src ? `<img src="${src}" style="height:${Math.round((w * 900) / 1440)}px">` : ""}
   </div>`;

/** A phone of outer width w around a screenshot of the given aspect (height / width). */
const phone = (x, y, w, src, aspect = 1688 / 780) => {
  const h = Math.round((w - 18) * aspect) + 18;
  const r = Math.round(w * 0.145);
  return `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${r}px">
     <img src="${src}" style="border-radius:${r - 9}px"></div>`;
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();

async function render(name, width, height, body, { png = false } = {}) {
  const file = path.join(TMP, `${name}.html`);
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${css} body{width:${width}px;height:${height}px}</style>${body}`);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ omitBackground: true, type: "png" });
  if (png) {
    const out = path.join(TMP, `${name}.png`);
    fs.writeFileSync(out, shot);
    return out;
  }
  await sharp(shot).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(path.join(OUT, `${name}.webp`));
  console.log(name);
}

// --- Project cards: a browser window with the desktop page and a phone over its corner.
const W = 1600, H = 1040;
const sites = [
  ["serbeke", "serbeke.com", "scroll-poster", "mobile-home"],
  ["profcosmetic", "profcosmetic-ykt.ru", "home", "mobile-home"],
  ["chinatradeco", "chinatradeco.app", "scroll-poster", "mobile-home"],
  ["dpo-imi", "ДПО ИМИ СВФУ", "scroll-poster", "mobile-home"],
  ["chaseje", "chaseje.com", "scroll-poster", "mobile-home"],
];
for (const [id, label, desktop, mobile] of sites) {
  await render(`work-${id}`, W, H,
    win(0, 0, 1410, 58, label, media(`${id}/${desktop}.webp`)) + phone(1238, 322, 322, media(`${id}/${mobile}.webp`)));
}

// СтудМаркет lives only in a phone: three screens instead of a window.
await render("work-studmarket", W, H,
  phone(190, 150, 360, media("studmarket/order.webp")) +
  phone(1050, 150, 360, media("studmarket/dark-home.webp")) +
  phone(590, 40, 420, media("studmarket/home.webp")));

// --- Hackathon apps, one phone each.
const hacks = [
  ["sweet-bridge", "sweet-bridge/02-home"],
  ["sahatyja", "sahatyja/01-feed"],
  ["oculus", "medical/02-patients"],
];
for (const [id, src] of hacks) {
  await render(`hack-${id}`, 760, 1620, phone(40, 30, 680, media(`hackathons/${src}.webp`), 1434 / 660));
}

// --- Wordmark for the light and the dark theme.
for (const [theme, ink] of [["light", "#07060b"], ["dark", "#ffffff"]]) {
  await render(`wordmark-${theme}`, 560, 190,
    `<div style="position:absolute;inset:0;display:grid;place-items:center;color:${ink};font:500 150px/1 Onest;letter-spacing:-0.045em">xrtem</div>`);
}

// --- Hero: the recording of saqaomuk.com inside the same window, as an animated WebP.
const HW = 1008, BAR = 40, FPS = 10, HH = Math.round((HW * 900) / 1440);
const heroCss = `<style>.win,.win::after{border-radius:16px}.bar{padding:0 16px;gap:8px}.bar i{width:10px;height:10px}.bar span{font-size:14px;padding:5px 20px}</style>`;
const frame = await render("hero-frame", HW, BAR + HH,
  heroCss + `<div class="win" style="left:0;top:0;width:${HW}px;height:${BAR + HH}px;background:transparent">
    <div class="bar" style="height:${BAR}px"><i></i><i></i><i></i><span>saqaomuk.com</span></div></div>`, { png: true });
const mask = await render("hero-mask", HW, BAR + HH,
  `<div style="position:absolute;inset:0;background:#000"><div style="position:absolute;inset:0;border-radius:16px;background:#fff"></div></div>`, { png: true });
await browser.close();

const frames = path.join(TMP, "frames");
fs.mkdirSync(frames);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-i", path.join(SITE, "public/media/work/saqaomuk/scroll.mp4"),
  "-loop", "1", "-i", frame,
  "-loop", "1", "-i", mask,
  "-filter_complex",
  `[0]fps=${FPS},scale=${HW}:${HH}:flags=lanczos,pad=${HW}:${BAR + HH}:0:${BAR}:color=0x17161d[v];` +
  `[v][1]overlay=0:0:shortest=1,format=rgb24[c];[2]format=gray[m];[c][m]alphamerge=shortest=1[o]`,
  "-map", "[o]", path.join(frames, "%04d.png"),
], { stdio: "inherit" });
// ffmpeg here is built without libwebp, so the frames are joined by img2webp.
execFileSync("img2webp", [
  "-loop", "0", "-lossy", "-q", "55", "-m", "4", "-d", String(Math.round(1000 / FPS)),
  ...fs.readdirSync(frames).sort().map((f) => path.join(frames, f)),
  "-o", path.join(OUT, "hero.webp"),
], { stdio: "inherit" });
console.log("hero");

fs.rmSync(TMP, { recursive: true, force: true });
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB");
