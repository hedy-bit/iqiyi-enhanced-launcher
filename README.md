# 爱奇艺水印守护

项目结构、当前限制与维护约定见 [项目总览](PROJECT_OVERVIEW.md) 和 [AGENTS.md](AGENTS.md)。这是 Windows 本机适配工具，尚未完成通用安装环境适配。

公开仓库仅包含源码与文档，不包含本机配置、日志、账号数据、媒体样本、客户端备份或第三方二进制。`config.example.json` 展示配置字段；实际 `config.json` 由 `Install.ps1` 生成。默认安装路径、Python 和 PotPlayer 路径须按本机环境核对。Python 原生模块依赖 Frida，可执行 `python -m pip install --target vendor frida==17.18.0` 安装到本机目录。

当前已识别的网页水印可以隐藏；右下角标识来源仍未确认，不能保证所有水印去除。完整 PotPlayer 外播尚未完成。测试入口为 `node --test *.test.mjs`。

## 功能

- 首页开屏/巨幕广告：识别 `adScreen` / `adScreenNew`，提前隐藏并调用该广告组件的关闭回调。
- 首页及播放器推荐广告：按明确的广告标识移除整张广告卡片；播放器侧栏横幅及其占位一起收起。普通影片推荐保留，列表节点复用为正常内容时解除隐藏。
- 页面广告规则位于 `page-ad-guard.js`，增强启动时自动加载；`status.json` 的 `pageAds` 记录开屏关闭次数和各类广告隐藏数量，Restore 会卸载规则。

- 播放中的角标/悬浮广告：提前隐藏播放器的 Layer/Inlayer 广告组件，随 DOM 重建和切集持续生效；规则包含在增强启动守护中。`overlayMatched` / `overlayHidden` 显示当前匹配和隐藏数量。

- 双击桌面“爱奇艺（增强启动）”时启动守护，再打开爱奇艺。没有 Windows 登录触发器；正常运行时没有守护窗口。爱奇艺进程退出约 30 秒后守护退出（最小化或关闭窗口但保留后台进程不算退出）。
- 在爱奇艺 WebView2 播放页面运行一个小样式脚本。已验证的默认水印图片出现约 3 秒后变透明，页面刷新或水印重新插入时继续生效。
- 暂停广告层刚出现时，直接调用已确认的暂停广告组件 `onAdClose` 回调，保持暂停并跳过按钮逻辑里的 500ms 等待；同时将该广告层的缩放、淡入淡出时长压到不可见。若将来组件结构改变，则回退到原生“关闭广告，放大暂停画面”按钮。不会调用“继续播放”。
- 防闪烁：让暂停广告层从第一帧透明，并将原生接口 `show_max_ad` 的“显示广告画面”请求改为保持普通画面，避免播放器先切换再恢复。其他播放命令原样传递；恢复脚本会还原该接口。
- 自动跳过开头的原生 `ad_brief` 广告：仅在播放器报告广告播放/暂停状态、slotType=15 且进度处于开头时，通过播放器原有 seekTo 接口逐段跳到广告末尾。时长取自广告组件，不固定为 31 秒；当前已验证的例子为 16 秒 + 15 秒。进入正片后停止，不处理未知中插广告。每段最多尝试一次、最多 5 段/180 秒，跳转失败时不循环重试。
- 保留安装文件原样，不再触发之前由直接修改脚本引发的启动问题。
- 禁用 QiyiService 后台更新服务，每 2 秒检查自动更新配置和安装目录、用户目录中的自动更新进程，发现后停止。
- 守护进程单实例、日志轮换、运行异常自动重试，任务失败最多重启 3 次。
- 影片操作区新增“PotPlayer 播放”。在点击时读取当前播放源，对普通本地媒体文件或明确的 HTTP(S) 媒体直链调用本机 `C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe`。不通过命令行 shell 转发，不能执行任意程序或脚本。

**外部播放限制：** 按钮不再仅凭影片或其他清晰度的 DRM 标志拒绝播放；发现普通媒体文件或 HTTP(S) 媒体直链后可交给 PotPlayer 尝试。成功启动程序不代表已验证影片解码成功。不会把爱奇艺网页 URL 当作媒体地址；无直链、无本地文件时明确提示未找到播放源。点击后保留爱奇艺的播放状态，不自动关掉原播放器。

HTTP(S) 外播会通过 Chromium 查询仅匹配该媒体地址的 Cookie，并携带 User-Agent，使用本机 `CmdLine64.txt` 中的 `/headers` 参数传给 PotPlayer；不记录 Cookie 或完整地址到日志。原生播放器的认证数据不一定存在于 Chromium Cookie 中，此功能不能代替实际播放地址的获取。目前所查影片的 path/videoURL/m3u8Url/mpdUrl 为空，未验证这些影片在 PotPlayer 中成功播放。

## 状态

### 原生窗口截图守护

`native-capture-guard.py` 使用本目录 `vendor` 中的 Frida，附加安装目录内的 `QyClient.exe` 和 `QyPlayer.exe`，在内存中拦截 `user32!SetWindowDisplayAffinity`，只调整所属进程窗口的第二个参数。默认将参数固定为 `0x0`，并每秒清理已有窗口限制；守护运行期间进程重建后重新附加。未修改安装文件，不提供网络服务，不上传代码或视频数据。

修改 `capture-settings.json` 中的 `is_ban`：JSON 的 `false` 表示保持 `0x0`；`true` 表示主动设置 `0x1`。保存后约一秒生效。`native-capture-status.json` 记录真实窗口读数和拦截次数。此机制只控制窗口截图限制，不保证所有视频渲染表面均能被截图。

依赖 `C:\ProgramData\anaconda3\python.exe`。Node 守护退出或运行 Restore 后会断开附加并卸载钩子；恢复后重启爱奇艺可让客户端重新决定窗口状态。已进行进程内测试：尝试设置 `0x1` 时，两个进程均被拦截，实际读回为 `0x0`。

截图标志测试：守护为每个 player/compactPlayer 页面加载 `capture-flag-guard.js`，将 `playMixer.forbid_record_screen` 持续设为 `false`，拦截后续 store.setProp 更新，并每 250ms 检查直接更新。页面重建后由守护重新加载。`status.json` 的 `captureFlag.current` 是实际读回值。该字段关闭并不保证原生视频画面能被 Windows 截图捕获；需要实际截图验证。Restore 会卸载此钩子并恢复最近接收的原始字段值。

计划任务名称：`IQIYI-Local-Logo-Guard`。

此任务仅供启动脚本按需调用，无登录/定时触发器。`Launch-Iqiyi.ps1` 会等待守护就绪再启动当前安装版本的爱奇艺。原来的爱奇艺快捷方式保持原样；要加载这些自动化，请使用桌面“爱奇艺（增强启动）”。首次安装或恢复后重新安装仍运行 `Install.ps1`，安装本身不会自动启动任务。

- `status.json`：最近的检查时间、每个页面识别到和已隐藏的水印数量。
- `runtime.log`：页面注入结果，只记录页面路径和计数，不记录播放凭据。
- `guard.log`：后台服务、更新进程和配置维护日志。

`matched: 1, hidden: 1` 表示当前匹配的水印已经透明。没有播放时，`matched: 0` 正常。

`pauseAdsClosed` 是本页面累计自动关闭的暂停广告次数。
`instantPauseCloses` 表示直接跳过动画完成的次数。若暂停后仅前者增加而后者不增加，说明使用了兼容回退，需要检查新版组件结构。
`nativeHook: true` 表示原生暂停广告画面拦截已安装，`nativePauseSwitchesBlocked` 记录阻止切换的次数。
`openingAds.skipped`、`openingAds.end` 分别记录本次影片已跳过的片头广告段数和最后跳转到的秒数。

## 暂停或恢复

双击 `Restore.cmd`，接受 Windows 管理员提示后，将停止并移除本工具的自启动，撤销当前页面样式，恢复本次操作前的自动更新配置及服务启动方式。之后退出并重新打开爱奇艺，关闭本地调试端口。

备份和日志不会删除。重新安装守护可在管理员 PowerShell 中运行 `Install.ps1`。

## 技术与限制

使用客户端自己的 `PluginConfig/Browser.ini` 中 `remote_debugging=1`。已验证监听地址是 **127.0.0.1:9222**，只对本机开放；仅连接 `localwebapp.iqiyi.com` 的 index/player/compactPlayer 页面。退出爱奇艺后端口关闭。请不要将此端口转发到外网。

依赖本机已有的 Node.js 22 或更新版本及 Windows PowerShell。相关文件夹须保留在当前位置。

更新拦截依赖守护持续运行及现有程序名和目录；不承诺在手动强制更新、程序更名或守护停止后仍能阻止更新。运行时水印隐藏仅针对已确认的独立图片图层，不处理编码进视频里的图案。客户端将来改变图层或调试配置后需要重新适配。

WebView2 调试机制参考：[微软文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code)。本客户端实际使用的是它自己的 Browser.ini 开关。
