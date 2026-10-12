# Codex 界面颜色审计（2026-10-12）

范围：官方 Windows Codex `OpenAI.Codex` 26.1007.2314.0，已核验主进程和 `app://-/index.html` CDP 目标（端口 9335）。检查为只读 DOM／计算样式采样；临时视觉预览已撤销。运行中的守护进程仍为旧版 0.1.7，源码 0.1.8 尚未作为常驻版本启用。

- Codex／ChatGPT 切换窗口：触发器 `button[aria-label^="切换模式"]` 在主页面；菜单经 portal 挂载在 `#root` 外，`role="menu"`，项目 `role="menuitem"`。原计算背景 `rgba(20,23,29,.1)`、模糊 `0px`、文字 `rgb(24,51,79)`；选中态由勾选 SVG 表示，并无可依赖的 `aria-selected`。说明文字使用 `--color-codex-description`，原值为半透明深色。没有切换到 ChatGPT 模式进行功能验收。
- 左下角头像菜单：触发器 `button[aria-label="打开个人资料菜单"]`；菜单同样在 portal 中，使用 `role="menu"`。原背景和文字与模式菜单相同。入口包括“剩余用量”“Hide Pet”“设置”等；“剩余用量”进入主 DOM 页面。并非所有头像子页面都已完成逐页截图验收。
- 左下角“＋”：触发器 `button[aria-label="添加文件等内容"]`；弹层是 body portal 中的 `[class*="ComposerTopMenuShell"]`，不是 `role="menu"`。原弹层表面半透明且无模糊；固定标题条为 `rgb(237,248,255)`，与输入框原始计算背景相同。输入框节点为 `[class*="ComposerLayoutRoot"]`。实现中“＋”表面和标题条改为与输入框相同的独立、不透明颜色。
- 权限控制：触发器 `button[aria-label="更改权限"][data-composer-navigation-target="permissions"]` 在输入框内；弹层经 portal 挂载，`role="menu"`，`aria-labelledby` 动态指向触发器 ID。原背景 `rgba(20,23,29,.1)`、模糊 `0px`、文字 `rgb(24,51,79)`，选项为 `role="menuitem"`。源码按触发器关联关系标记此菜单，使其与输入框和“＋”弹层共用不透明背景色；其他普通菜单继续用独立毛玻璃。
- 资料库和插件：均在主文档 DOM 中。标题已用部分浅色 token，但网格视图按钮、标签、输入框等仍读取 `--color-text` 等深色 token，原根变量 `--color-text` 为 `#18334f`。本轮补齐这些 token，未把所有 SVG 强制填色。
- 设置与宠物：设置容器为 `main[class*="MainContentSurface"]`，实测导航包含 19 个入口：常规、通知、导入、个人资料、外观、账户、Archived chats、家长控制、语音、存储、配置、个性化、Mini 与虚拟宠物、键盘快捷键、使用情况和计费、数据管理、插件、密码、电脑操控。导航、标题、控件存在深浅 token 混用；宠物页标题已偏浅，按钮仍偏深。部分子页异步加载，尚不能宣称 19 页全部完成视觉验收。
- 标题栏：页面内工具栏 `[class*="app-shell-header-toolbar"]` 可由渲染器样式接入。Windows 最小化、最大化、关闭按钮不在本次检查的页面 DOM 中（候选数为 0），不得宣称 CSS 已覆盖原生窗口按钮，也未修改官方安装文件。

临时视觉预览见 `work/audit/v6-live-preview-*/results.json`：模式菜单模糊 18px，文字从深色恢复为选定的浅色；“＋”菜单与输入框背景一致且不模糊。白色预览中，两者的计算背景均为 `rgb(255,255,255)`；发现原浅灰字体对比度不足，因此源码增加了仅限输入框、“＋”和权限控制弹层的低对比度保护。权限弹层临时预览也验证了纯白背景、无模糊、深色文字，预览结束后已撤销。该预览不等于新版常驻代码已在真实客户端完成重启验收。尚需在普通 Windows 桌面会话重启 GPTDaddy 守护进程后，对 19 个设置子页、资料库、插件、各弹窗重开、重启恢复及原生按钮限制逐项实测。
