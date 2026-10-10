# 增强爱奇艺项目总览

Windows 本机按需启动工具，通过客户端本机调试接口加载页面规则，并管理可恢复的守护进程。它是针对已观察客户端结构的适配代码，不能保证其他版本兼容。

## 架构

`Launch-Iqiyi.ps1` → 无触发器的计划任务 → `Guard.ps1` → Node `guard.mjs` → 本机 CDP 页面；Node 同时管理可选的 Python 原生窗口守护。

| 文件 | 职责 |
| --- | --- |
| `Install.ps1` / `Launch-Iqiyi.ps1` | 生成本机配置、安装按需任务、唤起客户端 |
| `Guard.ps1` | 单实例、客户端生命周期、更新配置及 Node 进程管理 |
| `guard.mjs` / `cdp.mjs` | 仅连接 localhost 调试端口，注入并查询页面规则 |
| `page-ad-guard.js` | 开屏、推荐卡片、侧栏、频道轮播广告处理 |
| `hide-watermark.js` | 已识别独立图片水印、暂停广告及悬浮广告处理 |
| `skip-opening-ads.js` | 根据已确认的片头广告组件进度执行跳过 |
| `capture-flag-guard.js` / `native-capture-guard.*` | 页面截图字段和原生窗口状态管理 |
| `potplayer*` | 普通本地文件或可用媒体直链的外部播放入口 |
| `ffmpeg-proxy/` | 独立实验源码；不接入增强启动，不发布客户端 DLL |
| `*.test.mjs` | 无需连接客户端的逻辑测试 |

## 状态与限制

- 已实现按需启动和原有后台进程存在时重新唤起客户端；没有 Windows 登录自启动。
- 广告识别包括明确广告标记及轮播游戏推广项。频道和客户端结构变化仍可能产生漏项。
- 网页独立水印图片可隐藏。用户报告的右下角水印仍未完成来源确认，不能声称已去除所有水印。
- PotPlayer 启动成功不代表受保护影片能够解码。完整影音外播尚未实现，视频转接实验也未达到可靠部署状态。
- 原生守护需要 Windows Python 和 Frida；当前代码仍含本机默认解释器路径，需要按安装环境适配。
- `Restore.ps1` 将更新配置恢复到预设值，不是任意机器历史配置的完整快照恢复。

## 安装与验证

Node.js 22+、Windows PowerShell；在管理员 PowerShell 中执行 `Install.ps1`，核对生成的本机 `config.json`，之后运行 `Launch-Iqiyi.ps1`。默认安装目录在 D 盘，其他位置需先适配安装脚本。原生模块需安装 `frida==17.18.0`，可使用当前代码优先加载的本机 `vendor/` 目录。

```powershell
node --test *.test.mjs
node guard.mjs --status
```

后一个命令依赖运行中的客户端。日志与状态在本机生成；报告中应只展示计数和页面路径，不能公开媒体签名地址、Cookie 或密钥。

## 公开仓库边界

只提交源码、测试、示例配置和文档。`.private/`、账号数据、实际 `config.json`、运行日志/状态、截图/视频、`vendor/`、客户端备份、FFmpeg 暂存 DLL 和构建目录保留在本机。根 `.gitignore` 使用允许列表，新文件需先检查内容再加入。
