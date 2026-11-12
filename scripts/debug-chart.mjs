import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu", "--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto(process.argv[2] ?? "http://localhost:8081/preview-l2-gestao", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));
const info = await page.evaluate(() => {
  const svgs = [...document.querySelectorAll(".recharts-surface")];
  const area = document.querySelector(".recharts-area-area");
  const curve = document.querySelector(".recharts-area-curve");
  const g = area?.closest("g");
  const cs = area ? getComputedStyle(area) : null;
  const csCurve = curve ? getComputedStyle(curve) : null;
  const grad = document.getElementById("gradVendasHora");
  return {
    surfaces: svgs.length,
    areas: document.querySelectorAll(".recharts-area-area").length,
    gradExiste: !!grad,
    gradStops: grad ? [...grad.querySelectorAll("stop")].map((s) => s.getAttribute("stop-color") + "@" + s.getAttribute("stop-opacity")) : null,
    areaFill: area?.getAttribute("fill"),
    areaStroke: area?.getAttribute("stroke"),
    areaOpacity: cs?.opacity,
    areaFillComputed: cs?.fill,
    areaStrokeComputed: cs?.stroke,
    areaVisibility: cs?.visibility,
    curveStroke: csCurve?.stroke,
    curveOpacity: csCurve?.opacity,
    gOpacity: g ? getComputedStyle(g).opacity : null,
    gDisplay: g ? getComputedStyle(g).display : null,
    parentOpacity: g?.parentElement ? getComputedStyle(g.parentElement).opacity : null,
  };
});
console.log(JSON.stringify(info, null, 2));
const card = await page.$(".recharts-surface");
if (card) {
  await card.screenshot({ path: "docs/erp-dark/prints/debug-chart-card.png" });
  console.log("card salvo");
}
await browser.close();
