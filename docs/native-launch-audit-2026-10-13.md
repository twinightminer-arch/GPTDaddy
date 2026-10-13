# Codex 原生启动与任务栏身份审计（2026-10-13）

此文记录本机只读检查结果。版本与快捷方式可能随官方更新变化；复测可运行
`scripts/audit-codex-launch.ps1`。脚本不会修改快捷方式、任务栏固定项或官方安装包。

## 已验证事实

- 安装包为 `OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0`；AppX manifest
  中主入口是 `Application Id="App"`，可执行文件是 `app/ChatGPT.exe`。
- 当前主窗口标题为 `ChatGPT`，但其主进程可执行文件位于上述 **Codex 包内**。
  不能只凭文件名把它认作另一款独立的 ChatGPT 应用。
- 目前主进程通过直连可执行文件启动，命令行带
  `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9335`。
  这不是普通快捷方式启动的验收结果。
- 对该进程调用 Windows `GetApplicationUserModelId` 返回 **15703**，即
  `APPMODEL_ERROR_NO_APPLICATION`（无应用身份）；这是直连 exe 会与包入口
  分组不同的更直接证据。该 API 结果只适用于当前直连启动的进程，不能代替
  固定项正常启动后的实测。错误含义见
  [Microsoft Win32 错误码文档](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--12000-15999-)。
- 用户现有桌面 `ChatGPT.lnk` 指向包入口
  `OpenAI.Codex_2p2nqsd0c76g0!App`；现有开始菜单 `ChatGPT.lnk`
  直接指向版本化的 `app/ChatGPT.exe`，快捷方式 AppUserModelID 为
  `com.openai.codex`。任务栏 Taskband 数据中可读到固定的包入口 ID
  `OpenAI.Codex_2p2nqsd0c76g0!App`。
- 对当前主 HWND 读取 `PKEY_AppUserModel_ID` 得到空值。它只说明窗口属性存储
  没有显式写入该键，**不能**据此断言任务栏分组 ID。桌面/任务栏与开始菜单
  入口标识不一致，加上当前直连 exe 的启动方式，是双图标的强烈线索；仍需
  对同一真实窗口进行任务栏分组实测，不能把推断写成已修复。
- GPTDaddy 用户级登录启动项已经存在，指向本项目的隐藏守护脚本，且守护进程
  正在运行。这个登录项只恢复后台服务及保存状态，不能在一个没有 CDP 的
  官方 Codex 进程里事后开启调试端口。

## 未通过 / 未执行

- 普通桌面、开始菜单、固定任务栏入口自动出现壁纸：**未通过**。此前普通启动
  实测主进程无 CDP，保存配置为 `enabled=true`，但 `active=false`。
- 当前会话中关闭并重开 Codex、Windows 重启、启动加载页无闪烁、单一任务栏图标：
  **尚未通过实机验收**。当前带 CDP 的窗口不能充当普通启动的证据。
- 原生标题栏右上角最小化、最大化、关闭控件不在 renderer DOM 中；字体颜色
  样式不覆盖这些控件。主 HWND 的 Win32 style 为 `0x14000000`，不能仅凭
  这一位掩码断定控件绘制方式；尚未验证安全的宿主级着色方案。

## 兼容边界与后续架构

当前公开的 Codex 插件机制包含 skills、MCP 和经信任的会话钩子，未提供全局
renderer 样式或启动加载页壁纸挂载点（参见
[OpenAI 插件打包文档](https://developers.openai.com/plugins/build/plugins)）。现有 CDP 架构应继续只附加到已验证的
Codex 包进程和回环端口，不得自动强退、改写官方包、劫持原快捷方式或误连别的
`ChatGPT.exe`。若未来官方提供全局 UI 扩展点，可迁移到该入口。若评估独立覆盖
窗口，必须先验证输入穿透、DPI、多屏、窗口层级、最小化同步和可访问性；在这些
条件未满足前不能把它当作已完成的替代实现。

### 独立覆盖窗口的可行性边界

Windows 分层窗口可用 `WS_EX_TRANSPARENT` 实现鼠标穿透，且 `WS_EX_TOOLWINDOW`
可避免把覆盖窗口当成普通任务栏应用；但它只能**盖在现有像素上方**。普通启动的
Codex 仍绘制不透明背景和卡片，因此视频覆盖层的低透明度会把壁纸与整页文字混
在一起，高透明度则遮挡交互内容。Windows 层窗口 API 本身不能按 Codex 的 DOM
语义只移除白色卡片、保留文字或给输入框独立着色。因此简单覆盖层不满足当前
验收标准，不应作为“限制已解决”的替代品。若探索捕获—重绘架构，还需单独
验证帧延迟、输入穿透、DPI、多屏、窗口层级及资源占用，不能直接发版。

Windows 分层窗口行为参考：
[Microsoft Window Features](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features)。

### 2026-10-13 用户确认的边界与复测

用户明确不允许 GPTDaddy 在普通启动后自动关闭并重开 Codex，即使仅限精确识别
的 Codex 进程。因此不能采用“后台守护进程发现无 CDP 实例后，温和退出并带参数
重启”的路径，也不能声称这条路径已实现。用户要求先解决原生启动限制再上传，
而非发布一个标明该功能未完成的预发布版。

用户随后允许退出重开验收。关闭当前窗口并不会退出 Codex 主进程；一次脚本化
尝试因此中止，未强制结束任何进程。随后用户完成了实际重启，并明确报告壁纸
与启动加载页均未恢复。复核显示新的主进程 PID 5312 属于同一官方 Codex 包，
`GetApplicationUserModelId` 返回 `OpenAI.Codex_2p2nqsd0c76g0!App`，没有
`--remote-debugging-port`；GPTDaddy 本地守护 `/health` 正常，持久化壁纸设置
`enabled=true`，但 `/api/status` 的 `cdpEnabled=false`、`lifecycle.active=false`、
`cdpAvailable=false`、`playbackHealthy=false`。所以本轮**原有入口自动恢复与启动
加载页适配验收失败**，不是配置丢失，也不能通过增加轮询或重试次数修复。

本地诊断 JSON 位于忽略发布的 `work/native-restart/`；这些脚本尝试本身没有完成
完全退出重开，不应被误读为通过报告。Windows 重启、三个入口逐一验收、单一
任务栏图标及两小时性能测试仍未通过。

随后用户又明确允许 GPTDaddy 自动重启已验证的官方 Codex 进程，因此上面的
“不允许自动重启”已不再是当前约束。当前新增的包激活探针使用 Windows
`IApplicationActivationManager.ActivateApplication` 的可选参数，目标是同时保留
包身份与启用回环 CDP；该 API 是否把参数真正传给此版本 Codex **尚未验证**。
探针在受限工具会话内退出 Codex 时会使会话中断，独立报告未落盘；因此不能
把它接入登录守护进程，也不能声称自动重启、单一图标或壁纸已实现。需要从
普通桌面会话运行一次 `scripts/probe-packaged-codex-restart.cmd`，读取
`work/native-restart/packaged-activation-outside-sandbox.json` 后再决定架构。

## 发布门槛

### 2026-10-13 包激活实测与当前实现

用户在普通桌面会话执行一次性测试。报告
`work/native-restart/packaged-activation-outside-sandbox.json` 记录：旧的官方
Codex PID 5540 通过应用自身「文件 > 退出」正常结束；Windows
`IApplicationActivationManager.ActivateApplication` 以包入口
`OpenAI.Codex_2p2nqsd0c76g0!App` 和回环 CDP 参数激活了新 PID 36572。
新进程命令行含端口 9335，守护进程报告 `lifecycleActive=true`、
`playbackHealthy=true`。用户同时确认壁纸已打开，任务栏只剩一个 GPT 图标。
因此“包入口携带参数可保留身份且壁纸正常播放”在本机这一版本已实测通过。

正式源码已加入 `NativeRestartSupervisor`：仅对守护进程启动后新出现的、
可执行路径属于官方 Codex AppX 包且没有 CDP 的单一主进程尝试一次；
预留稳定等待，失败后本次守护进程不再自动重试。重启使用经实测的包激活脚本，
不触碰官方文件或用户已固定的任务栏图标。这个自动路径的三种原有入口、
Windows 重启、任务中保护以及失败回退 **仍待实机验收**。初始原生加载页在
CDP 附加前无法由当前渲染器注入方式着色或播放壁纸，仍为未解决项。

用户随后从原任务栏入口打开 Codex，自动报告
`%LOCALAPPDATA%\GPTDaddy\native-restart.json` 记录旧 PID 20244 正常退出、
新 PID 20396 以原包入口与端口 9335 启动，`result=passed`、
`lifecycleActive=true`、`playbackHealthy=true`；用户确认经历一次重启后壁纸出现。
这是**一次**自动恢复成功，不等于三入口、Windows 重启或原生加载页全部通过。
当时守护进程误把该结果标为 `blocked/error`，原因是 Windows PowerShell 5.1
`Set-Content -Encoding UTF8` 写出的 BOM 使 Node 的 `JSON.parse` 报错；
0.2.0 源码已改为写无 BOM JSON，并兼容读取旧 BOM 报告。

上文早期的“禁止自动重启”“包激活未验证”陈述是当时的时间线记录，
不再表示当前代码和授权状态。

不把“守护进程已运行”“配置已保存”或“CDP 测试会话正常播放”写成原生启动已完成。
若发布当前代码，只能标注为预览/预发布，明确上面的失败项，不得标为正式完成。
