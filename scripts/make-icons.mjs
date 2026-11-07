// Renders Mister Joe into the app icon and tray icon, then lets Tauri make every
// platform size (icns, ico, pngs). Run: npm run icons
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { joeSvg } from "../src/lib/joeSvg.ts";

const root = new URL("..", import.meta.url).pathname;
mkdirSync(`${root}src-tauri/icons`, { recursive: true });

const tile = joeSvg("idle", { tile: true });
writeFileSync(`${root}public/mister-joe.svg`, tile);
writeFileSync(`${root}src-tauri/icons/source.svg`, tile);

await sharp(Buffer.from(tile), { density: 600 }).resize(1024, 1024).png().toFile(`${root}src-tauri/icons/source-1024.png`);

// Tray / menu bar icon: just Joe's face, no tile.
const face = joeSvg("idle");
await sharp(Buffer.from(face), { density: 600 }).resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`${root}src-tauri/icons/tray.png`);

execFileSync("npx", ["tauri", "icon", `${root}src-tauri/icons/source-1024.png`], { cwd: root, stdio: "inherit" });
console.log("icons ready");
