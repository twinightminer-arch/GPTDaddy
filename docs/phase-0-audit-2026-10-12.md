# GPTDaddy 现状审计（2026-10-12，Asia/Taipei）

范围：官方 OpenAI.Codex Windows 客户端、旧 Wallpaper Engine 插件残留、
GPTDaddy 当前运行状态及界面可读性。只读检查与截图；未执行删除、卸载或
改动 Codex 官方文件。

后续决定：用户现已明确要求把旧插件连源码一起删除。本报告原先的
“源码永久保留”和“先备份”建议已被此新要求取代。清理脚本见
`scripts/remove-legacy-plugin.ps1`；受当前沙箱写入范围限制，尚未执行。

## 已核实的状态

- 官方包 `OpenAI.Codex` 版本 `26.1007.2314.0` 正在运行。此次会话从进程
  命令行识别到仅绑定 `127.0.0.1` 的 CDP 端口 `9335`，GPTDaddy 连接到
  唯一的 `app://-/index.html` 主页面。
- 已保存壁纸 `2789854092`。检查时 `active=true`、`playbackHealthy=true`，
  视频 `readyState=4`、`paused=false`、`presentedCallbacks=7334`、
  `presentedFrames=7969`、`droppedFrames=3`、`freezes=0`。这些是某一时刻
  的真实播放遥测，不代表已通过对话切换或长期运行验收。
- 本机截图 `../work/audit/codex-live-2026-10-12T12-26-33.791Z.png`
  显示壁纸在 Codex 内容区域背后，但主聊天正文为暗蓝色，叠加暗色视频后
  对比不足，明显难读。当前可读性不合格。截图中也未见 GPTDaddy 悬浮
  入口或客户端内控制面板。
- GPTDaddy 目前有独立的本机浏览器控制页，但没有注入 Codex 内的悬浮
  按钮、多标签面板或完整图形壁纸库。不能把浏览器控制页称为客户端内入口。
- `work/live-validation` 中未发现十分钟验收日志。因此 `active/healthy`
  的瞬时状态不能替代 20 次对话切换、10 次工作区切换或 2 小时播放测试。

## 旧插件残留清单

| 位置 | 实况 | 处理建议 |
| --- | --- | --- |
| `%USERPROFILE%\plugins\dsh-plugin-wallpaper-engine-codex` | 源码、`.git`、`install.ps1`、`src`、`skills`、`.mcp.json` 均在；`.mcp.json` 定义 `codex_skin` → `scripts/mcp-server.mjs` | 按用户最新要求永久删除 |
| `%LOCALAPPDATA%\CodexWallpaperEngineSkin\launch-codex-with-skin.ps1` | 文件存在；目录目前只见此文件 | 按用户最新要求删除旧运行目录 |
| 开始菜单 `Codex Wallpaper Skin.lnk` | 存在；目标为 PowerShell，参数指向上述旧运行时脚本 | 按用户最新要求删除 |
| 桌面 `Codex Wallpaper Skin.lnk` | 未发现 | 无需处理 |
| `%USERPROFILE%\.codex\config.toml` | 没有 `codex_skin` 或壁纸 MCP 配置段 | 无需改动；这不能单独证明 marketplace 插件未安装 |

旧启动脚本扫描所有主 `ChatGPT.exe` 进程；用户在其弹窗中确认后，会对
所有匹配进程执行 `Stop-Process -Force`。它没有先按官方 Codex 包身份
严格过滤。这与 GPTDaddy 的进程隔离要求冲突，所以不应作为日常入口。

## 下一阶段的具体工作

1. 修正文可读性：检查 Codex 实际文字和背板的计算样式，将正文区置于
   稳定、足够不透明的内容背板上，保留壁纸在内容层之下；实机截图复核。
2. 注入可拖动、可隐藏的悬浮入口和中文控制面板；实现禁用入口及一键
   恢复官方界面，再进行窗口截图与交互检查。
3. 将壁纸库操作、当前守护进程状态和后续 MCP 工具统一到同一状态源。
4. 分别记录对话/工作区切换、最小化恢复和长时间播放的帧遥测。

旧残留尚未清理。用户已明确授权永久删除旧插件及源码；但这些目标均位于
当前工作区沙箱外。`scripts/remove-legacy-plugin.ps1` 已通过 Windows
PowerShell 5.1 只读预检，仅命中列出的旧插件目标及一个 marketplace 条目，
待用户从普通桌面会话运行 `scripts/remove-legacy-plugin.cmd` 后核验。

第一次桌面执行清理时，Windows PowerShell 5.1 的 `File.Replace` 不接受
空备份路径，因而在改写 marketplace 记录时抛出“路径的形式不合法”。
程序未进入快捷方式、运行目录和源码删除阶段；再次只读预检确认目标仍在、
marketplace 条目仍在。现已把替换操作改为同目录的明确备份路径，并在
工作区内使用 PowerShell 5.1 临时文件验证替换成功。需重新运行清理脚本。

正文对比问题的直接原因：Codex 当前为浅色主题，文字计算色为
`rgb(24, 51, 79)`，而旧注入规则强制使用 `rgba(20, 22, 26, 0.72)`
暗色背板。已在实机临时应用按主题选择的浅色半透明背板，截图
`../work/audit/codex-live-2026-10-12T12-43-30.650Z.png` 显示正文可读。
该规则已写入新注入代码，但现有守护进程需重新启动才会加载新版本。
