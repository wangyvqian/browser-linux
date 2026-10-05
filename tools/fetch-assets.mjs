import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { stat } from "node:fs/promises";

const assets = [
  ["public/bios/seabios.bin", "https://copy.sh/v86/bios/seabios.bin"],
  ["public/bios/vgabios.bin", "https://copy.sh/v86/bios/vgabios.bin"],
  ["public/images/buildroot-bzimage68.bin", "https://i.copy.sh/buildroot-bzimage68.bin"],
];

for (const [target, url] of assets) {
  await mkdir(target.replace(/[/\\][^/\\]*$/, ""), { recursive: true });
  try {
    const info = await stat(target);
    if (info.size > 0) {
      console.log("cached", target);
      continue;
    }
  } catch {}

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  await pipeline(response.body, createWriteStream(target));
  console.log("fetched", target);
}
