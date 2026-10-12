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

/** Diagonal tiled watermark (team name, code, time) as a transparent PNG. */
async function overlay(width: number, height: number, label: string): Promise<Buffer> {
  const key = `${width}x${height}|${label}`;
  const hit = overlayCache.get(key);
  if (hit) return hit;
  const diag = Math.ceil(Math.sqrt(width * width + height * height));
  const rows = Math.ceil(diag / 170);
  const cols = Math.ceil(diag / 520);
  const buf = await renderPng(
    (
      <div style={{ width, height, display: "flex", position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: (width - diag) / 2,
            top: (height - diag) / 2,
            width: diag,
            height: diag,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            transform: "rotate(-30deg)",
          }}
        >
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} style={{ display: "flex", justifyContent: "space-around", marginLeft: r % 2 ? 260 : 0 }}>
              {Array.from({ length: cols }).map((__, c) => (
                <div key={c} style={{ fontSize: 30, color: "rgba(20,20,20,0.10)", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {label}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    width,
    height,
  );
  remember(overlayCache, key, buf, 60);
  return buf;
}

/** Burns the team watermark into a page image and returns WebP bytes. */
export async function watermarked(src: Buffer, team: { name: string; code: string }) {
  const meta = await sharp(src).metadata();
  const width = meta.width ?? 1240;
  const height = meta.height ?? 1754;
  const label = `${team.name} · ${team.code} · ${istTime(new Date())}`;
  const ov = await overlay(width, height, label);
  return sharp(src).composite([{ input: ov }]).webp({ quality: 84 }).toBuffer();
}

/** Inject 2: the MD's WhatsApp message, with the real deadline filled in. */
export async function renderInject2(deadlineIso: string | null): Promise<Buffer> {
  const deadline = deadlineIso
    ? new Date(deadlineIso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
    : "the deadline";
  const sentAt = deadlineIso ? istTime(new Date(Date.parse(deadlineIso) - 20 * 60_000)) : "";
  const body = `We hear your auditors are raising small issues. Every growing company has a few. We have another investor ready to sign. As a gesture, if you sign the term sheet before ${deadline} today, we will accept the same amount for 25% instead of 20%. After that the offer is withdrawn. Let us not lose a good deal over paperwork.`;
  const W = 1240, H = 1500;
  const buf = await renderPng(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#ffffff", fontSize: 30, color: "#1f1f1f" }}>
        <div style={{ display: "flex", flexDirection: "column", padding: "48px 64px 32px", borderBottom: "2px solid #e1e3e1" }}>
          <div style={{ fontSize: 40, fontWeight: 700, marginBottom: 18 }}>Fwd: Message from Rajiv Mittal</div>
          <div style={{ display: "flex", color: "#444746", fontSize: 26 }}>From: Deal team, Teesta Ventures &lt;deals@teestaventures.in&gt;</div>
          <div style={{ display: "flex", color: "#444746", fontSize: 26, marginTop: 6 }}>To: Audit team</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 28 }}>
            Forwarding the WhatsApp below that Rajiv sent us a few minutes ago. Please include your view in your report.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", margin: "40px 64px", border: "2px solid #d0d0d0", borderRadius: 28, overflow: "hidden", flexGrow: 1 }}>
          <div style={{ display: "flex", alignItems: "center", background: "#075e54", color: "#ffffff", padding: "26px 32px" }}>
            <div style={{ width: 70, height: 70, borderRadius: 35, background: "#cfd8dc", color: "#37474f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, marginRight: 24 }}>
              RM
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>Rajiv Mittal (Himalayan Leaf)</div>
              <div style={{ fontSize: 22, opacity: 0.85 }}>online</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", background: "#efe7de", padding: 40, flexGrow: 1 }}>
            <div style={{ display: "flex", alignSelf: "center", background: "#e1f2fb", color: "#54656f", fontSize: 22, padding: "8px 20px", borderRadius: 12, marginBottom: 30 }}>TODAY</div>
            <div style={{ display: "flex", flexDirection: "column", background: "#ffffff", borderRadius: 20, padding: "26px 30px 18px", maxWidth: 940, boxShadow: "0 2px 2px rgba(0,0,0,0.12)" }}>
              <div style={{ display: "flex", lineHeight: 1.45, fontSize: 31 }}>{body}</div>
              <div style={{ display: "flex", alignSelf: "flex-end", color: "#667781", fontSize: 22, marginTop: 12 }}>{sentAt}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", padding: "0 64px 40px", color: "#5e5e5e", fontSize: 22 }}>Doc ID: INJ-02</div>
      </div>
    ),
    W,
    H,
  );
  return buf;
}
