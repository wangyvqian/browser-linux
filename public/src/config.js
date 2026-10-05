// Boot profiles. `screen` renders the emulated VGA text console; `serial`
// wires xterm.js to ttyS0 and needs a kernel whose cmdline we control.
//
// v86 has no long mode, so every image here must be a 32-bit x86 kernel.
// The stock `buildroot-bzimage68.bin` from i.copy.sh is 64-bit and hangs
// silently — do not use it as a serial test image.
export const PROFILES = {
  "test-vga": {
    label: "v86 测试镜像 (i686 内核, VGA 控制台)",
    memory_size: 128 * 1024 * 1024,
    console: "screen",
    bios: { url: "/bios/seabios.bin" },
    vga_bios: { url: "/bios/vgabios.bin" },
    cdrom: { url: "/images/linux.iso" },
  },
  debian: {
    label: "Debian i386 (串口控制台)",
    memory_size: 512 * 1024 * 1024,
    console: "serial",
    bios: { url: "/bios/seabios.bin" },
    vga_bios: { url: "/bios/vgabios.bin" },
    // Produced by .github/workflows/build-image.yml into the site's /images dir.
    hda: {
      url: "/images/debian-chunks/chunk.zst",
      async: true,
      use_parts: true,
      fixed_chunk_size: 128 * 1024,
      size: 4 * 1024 * 1024 * 1024,
    },
    cmdline: "console=ttyS0,115200 rw root=/dev/sda1",
  },
};

const requested = new URLSearchParams(location.search).get("profile");
export const ACTIVE = PROFILES[requested] ?? PROFILES["test-vga"];
