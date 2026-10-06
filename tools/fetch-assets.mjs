import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { stat } from "node:fs/promises";

const assets = [
  ["public/bios/seabios.bin", "https://copy.sh/v86/bios/seabios.bin"],
  ["public/bios/vgabios.bin", "https://copy.sh/v86/bios/vgabios.bin"],
  // Small enough to ship, and it is the only profile that needs no build.
  ["public/images/linux.iso", "https://i.copy.sh/linux.iso"],
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
