# 本地助手(local-helper)设计

状态:设计已定,尚未实现。选定栈为 **Debian i386 + Yaru 主题**,由本地便携文件夹提供"这是用户自己的系统"的体验。

## 角色划分

助手不跑虚拟机,也不执行 guest 指令。guest 始终由浏览器里的 v86 带动。助手只做两件事:

1. **喂文件**:把镜像和可写磁盘从 `127.0.0.1` 给页面,省掉外网下载,并让 GB 级磁盘和持久化成为可能。
2. **通网络**:实现 v86 原生的 `wisp` 后端,让 guest 的 TCP 出去,apt/curl 可用。

消除 CPU 限制的是另一个方案(本地真虚拟机),不在本设计范围内。

## 为什么必须用可写磁盘而不是 initrd

initrd 每次开机都是全新内存盘,用户装的东西、写的文件重启即消失——这与"这个系统是我的"直接冲突。所以:

- 有助手时:`linux.img` 是用户文件夹里的一个真实文件,ext4,可写,持久。apt 装的东西留在里面。
- 无助手时:退回只读 initrd 终端体验,页面明确告知"这次是临时系统"。

## 便携文件夹布局

目标是让用户敢用记事本打开它:

```
my-linux/
  打开系统.txt          # 双击运行,内容是启动说明和自己的机器信息
  browser-linux-helper.exe
  machine.json          # 机器名、创建时间、系统版本、语言
  linux.img             # 他自己的磁盘:所有文件、装过的软件都在这里
  saved/                # 还原点,用户可命名
    2026-10-06-装好开发环境.bin
  settings.json         # 内存大小、开机是否自动启动、网络白名单
  images/               # 内核与基础镜像,带 .sha256
```

`machine.json` 里的名字会出现在:页面标题栏、桌面壁纸署名、guest 的 `/etc/hostname` 和 shell 提示符。用户改名 → 助手写回镜像。

备份即"复制这个文件夹";换电脑即"把文件夹拷过去",身份和数据一起走。

## 网络协议

- **传输**:v86 `net_device.relay_url = "wisp://127.0.0.1:48120"`。v86 自带 wisp 客户端和 guest 侧 TCP 状态机,我们不造协议。
- **限制**:v86 的 wisp 实现目前只支持 TCP,不支持 UDP;DNS 由 v86 内置的 DoH 处理。所以 apt(HTTP/HTTPS)可用,guest 里 `ping` 之类是 v86 伪造的应答。
- **监听**:只绑 `127.0.0.1`,绝不绑 `0.0.0.0`。

## 配对与鉴权

**前提已验证(2026-10-06)**:从线上 `https://wangyvqian.github.io/browser-linux/probe.html` 发起,`ws://127.0.0.1:48120` 握手成功并双向收发,`fetch("http://127.0.0.1:48121/ping")` 返回 200 并读到响应体。本机服务能看到请求头 `Origin: https://wangyvqian.github.io`,所以按来源做白名单可行。随时可用 `public/probe.html` + `tools/probe-server.mjs` 复验。

本地任意端口都是攻击面:任何网页都能连 `ws://127.0.0.1:48120`。不校验等于给用户装了个别人可借用的代理。

1. 页面生成一次性 token(`crypto.getRandomValues`,16 字节,60 秒过期)。
2. 用户点"连接我的系统" → 页面打开 `browser-linux-helper://pair?t=<token>&origin=<origin>`。协议处理器由文件夹首次运行时注册到 HKCU(无需管理员)。
3. 助手收到 token 后,页面再发起 `ws://127.0.0.1:48120/pair?t=<token>`,发送 `hello{token, origin, protocol:1}`。
4. 助手校验:token 未用且未过期、`Origin` 在允许列表内(默认只放行本站 Pages 域名和 localhost)。失败直接关闭并记日志。
5. 通过后回 `hello-ok{protocol, helper_version, manifest_digest, features[]}`,token 作废。
6. 之后每次连接复用已配对的 origin;用户在助手里可以撤销。
7. 兜底:协议处理器没注册成功时,助手窗口显示 6 位数字,用户在页面输入完成配对。

出站域名默认白名单(Debian 镜像、GitHub、常见 npm/PyPI),越界请求在助手托盘里提示并允许一次性放行。这是把"任意 TCP 代理"收敛成"我的机器的出站规则"。

## 部署拓扑(GitHub Pages)

已验证的事实,决定了文件必须放哪:

- **Release 资源没有 `access-control-allow-origin`**,网页 JS fetch 不到;它只能被用户点击下载。所以 Release 只用来分发便携包本身。
- Pages 目录里的文件与站点同源,fetch 无障碍,且支持 `Accept-Ranges`。
- 因此大镜像**不进 Release,而是切成小块放 Pages**:v86 的 `use_parts` + `fixed_chunk_size` 会把磁盘按 128KB 切片(官方 `tools/split-image.py --zstd 128k`),产物是几万个几 KB 的小文件。这同时绕开了单文件大小限制和 CORS,还能只下载实际读到的块。

| 内容 | 放哪 | 原因 |
|---|---|---|
| 站点 + v86 引擎 | Pages | 同源,小 |
| 终端镜像(kernel 7MB + initrd 36MB) | Pages | 同源,单文件在限制内 |
| 桌面磁盘镜像 | Pages,128KB zstd 分块 | 绕开单文件限制,按需取块 |
| 便携助手 zip | Releases | 供用户点击下载 |
| Git LFS | 不用 | Pages 不服务 LFS 内容,且带宽计量 |

待验证:Pages 站点 1GB 软上限和构建频率对分块数量的实际影响。

## 降级路径

页面加载时探测助手(1 秒超时,静默失败):

1. 助手在且已配对 → 可写磁盘 + 联网 + 桌面。
2. 助手不在但 IndexedDB 有缓存 → 用缓存的只读镜像。
3. 都没有 → 下载终端镜像,页面顶部一条不挡路的提示:"想要自己的磁盘和联网,下载本地助手"。

任何一级都不能出现空白页:必须始终有可交互的终端。
