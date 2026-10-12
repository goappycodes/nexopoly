import "server-only";
import { readFileSync } from "fs";
import path from "path";
import satori from "satori";
import sharp from "sharp";
import { db } from "./db";

let fontData: Buffer | null = null;
const font = () => (fontData ??= readFileSync(path.join(process.cwd(), "lib/fonts/NotoSans-Regular.ttf")));

/** JSX to PNG: satori lays out and outlines the text, sharp rasterises the SVG. */
async function renderPng(node: React.ReactElement, width: number, height: number) {
  const data = font();
  const svg = await satori(node, {
    width,
    height,
    fonts: [
      { name: "Noto Sans", data, weight: 400, style: "normal" },
      { name: "Noto Sans", data, weight: 700, style: "normal" },
    ],
  });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const pageCache = new Map<string, Buffer>();
const overlayCache = new Map<string, Buffer>();

const remember = (m: Map<string, Buffer>, key: string, buf: Buffer, max: number) => {
  m.set(key, buf);
  if (m.size > max) m.delete(m.keys().next().value as string);
};

export async function loadPage(docId: string, page: number): Promise<Buffer> {
  const key = `${docId}/${page}`;
  const hit = pageCache.get(key);
  if (hit) return hit;
  const { data, error } = await db().storage.from("pages").download(`${docId}/${page}.png`);
  if (error || !data) throw new Error(`Page not found: ${key}`);
  const buf = Buffer.from(await data.arrayBuffer());
  remember(pageCache, key, buf, 120);
  return buf;
}

const istTime = (d: Date, withSeconds = false) =>
  d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, hour12: false });

/** One watermark tile (team name, code, time) as a transparent PNG; sharp repeats it across the page. */
const TILE_W = 600;
const TILE_H = 330;
async function tile(label: string): Promise<Buffer> {
  const hit = overlayCache.get(label);
  if (hit) return hit;
  const buf = await renderPng(
    (
      <div style={{ width: TILE_W, height: TILE_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", transform: "rotate(-28deg)", fontSize: 26, fontWeight: 700, color: "rgba(20,20,20,0.10)", whiteSpace: "nowrap" }}>{label}</div>
      </div>
    ),
    TILE_W,
    TILE_H,
  );
  remember(overlayCache, label, buf, 60);
  return buf;
}

/** Burns the team watermark into a page image and returns WebP bytes. */
export async function watermarked(src: Buffer, team: { name: string; code: string }) {
  const label = `${team.name} · ${team.code} · ${istTime(new Date())}`;
  const t = await tile(label);
  return sharp(src).composite([{ input: t, tile: true, blend: "over" }]).webp({ quality: 84 }).toBuffer();
}
