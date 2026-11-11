// Builds the banner of the profile README from the media of the xrtem.dev checkout.
//
//   node scripts/build-assets.mjs /path/to/xrtem.dev
//
// Needs the site's own node_modules (puppeteer-core, sharp), Google Chrome and ffmpeg.
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

await browser.close();

fs.rmSync(TMP, { recursive: true, force: true });
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB");
