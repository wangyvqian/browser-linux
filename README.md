# browser-linux

在浏览器里真的 boot 一个 Linux:x86 模拟器跑真内核,纯静态站点,打开链接就能用。

## 跑起来

```bash
npm install
npm run setup   # 同步 vendor 资源 + 下载 BIOS 和测试镜像
npm run dev     # http://localhost:8000/
```

## 已验证

`node tools/boot-test.mjs vga` 会真的启一个内核并在 shell 里执行命令,当前通过:

```
PASS [vga]: linux.iso booted to a usable shell
Linux (none) 2.6.34.14 #44 Tue Oct 15 20:50:15 CEST 2013 i686 GNU/Linux
```

## 硬约束

- **v86 没有 long mode,只能跑 32 位内核。** 这也是选 Debian i386 而不是 Ubuntu 的原因:Ubuntu 的 i386 停在 16.04/18.04。
- **直接内核启动(`bzimage`)必须同时提供 `bios` 和 `vga_bios`。** 少了它们,v86 会在实模式下跳进内核入口,表现为 `instr16_E8` 断言崩溃,串口和 VGA 一个字节都不出。`examples/serial.html` 不给 BIOS 的写法在当前版本是坏的。
- **内核命令行要带 `noapic nolapic`。** v86 的 APIC/IOAPIC 支持不完整,不开这两个参数内核会在 `setup_IO_APIC` 里空指针崩掉。
- **不要用 initrd 装 Debian 的 rootfs。** bookworm 是 merged-usr,initramfs 根上的 `/bin`、`/sbin`、`/lib` 都是指向 `usr/` 的符号链接,结果 `/init` 和 `init=/usr/bin/dash`(字面路径)全部 `Failed to execute ... (error -2)`,而同一批文件放在磁盘上能正常 exec。现在只有磁盘一条启动路径。
- 官方 `i.copy.sh/buildroot-bzimage68.bin` 在 v86 里静默挂死,不要拿它当测试镜像。
- 纯静态页面下 guest 没有网络,apt 只能在构建时用。运行时联网需要一个中转服务。
- v86 主循环挂在 `requestAnimationFrame` 上,**标签页不可见时会被节流到几乎不执行**(实测 0.3 MIPS)。真机验证必须让页面保持可见。

## 目录

- `public/` — web root,直接部署到 GitHub Pages
- `public/src/config.js` — 启动 profile,决定用哪个镜像、走 VGA 还是串口
- `tools/` — vendor 同步、资源下载、静态服务器、启动冒烟测试
- `image/` + `.github/workflows/build-image.yml` — Debian i386 镜像构建,产物是 `debian-bzImage` 和 `debian-initrd`

## 状态

测试镜像(VGA)已跑通。自建 Debian i386 镜像的 CI 流程尚未在真实 runner 上验证过,`debian` profile 要等它产出镜像才可用。
