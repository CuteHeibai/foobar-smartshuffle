# 开发说明

## 结构

| 路径 | 职责 |
| --- | --- |
| `src/core.*` | 无宿主依赖的权重、相似度、轮次与序列化 |
| `src/native.cpp` | foobar SDK 回调、队列、来源歌单、bridge v1 |
| `src/native_dialogs.*` | 独立二维偏好窗口、更新窗口 |
| `src/updater.hpp`、`src/update_policy.hpp` | 后台 HTTPS 检查、版本和安装包选择 |
| `src/scanner.*`、`analyzer/` | foobar 解码、片段抽取、本地声学分析与信息索引 |
| `src/lyrics_host.*` | ESLyric 子面板承载 |
| `assets/fonts/` | Inter 字体、原始许可和来源校验值 |
| `theme/verdant/` | 完整版 JSplitter 界面 |
| `scripts/install.py` | 两版安装、备份、失败恢复 |
| `scripts/package_public.py` | 公开安装包、许可、校验清单 |
| `tests/` | 核心、主题、安装与宿主接口测试 |

`build/`、`dist/`、`vendor/`、`.venv/` 和 `test-player/` 为本地产物，不提交。根目录 [AGENTS.md](../AGENTS.md) 定义必须保持的行为约束。

## 构建环境

Windows x64，Visual Studio 2022 的 C++ v143 工具集，Windows SDK 10.0.22621.0，Node.js，Python。分析工具使用项目隔离的 Python 3.13 环境；安装／恢复脚本要求 Python 3.10+。

```powershell
.\scripts\fetch-deps.ps1
.\scripts\build.ps1 -TestsOnly
.\scripts\build.ps1
.\scripts\build-analyzer.ps1
```

原生输出为 `build/foo_smartshuffle.dll`。分析运行时输出为 `build/analyzer/smartshuffle-analyzer/`。只改原生代码或主题时，可以复用未变动的分析运行时。

## 调度与预览

每个歌单按 GUID 保存偏好、轮次、已尝试集合及剩余顺序。曲目以路径和子曲目编号识别。排序采用两轴加权的不放回抽样，中心均匀随机。生成后保存完整顺序，统计变化不重排当前轮。

频率分数为 `ln(1 + 累计次数) + 2 × ln(1 + 近30天次数)`，再转换为歌单内相对排名。有效收听按实际播放时间累计，门槛为 60 秒和半曲时长的较小值，暂停、跳转不计入时长。

风格轴依照上一首的声学特征及标签逐首计算，片段由宿主解码器按子曲目边界获取。缓存键包含路径、子曲目、大小、修改时间及分析版本。动态风格排序为 O(n² × 特征维度)。

界面操作流程为 `open → preview → apply/cancel`。拖动约 150ms 后生成预览，同次使用固定种子。应用须匹配预览 token 和 Engine revision。主题和独立窗口复用该流程。

## 本地接口

接口版本为 1。`scripts/bridge.py` 提供客户端示例。独立客户端在 `profile/smartshuffle/commands/` 写入唯一 ID 的 JSON 请求，响应从 `replies/` 获取并清理。主题使用自己的握手通道，避免互相覆盖。

常用操作：`state`、`open`、`preview`、`apply`、`cancel`、`restart`、`scan_pause`、`playback_mode`。独立窗口入口为 `native_preferences`；更新操作为 `update_check`、`update_open`、`update_config`。新增命令应由原生层校验参数、曲目身份及过期状态。

更新检查完全在后台进行，结果经 UI 线程的 tick 消费。详见 [更新机制](updates.md)。

## 默认窗口与布局

深浅配色由 `core/tokens.js` 的语义色板提供，切换入口为“视图 → 外观”。`theme_appearance` 命令校验并保存选择，主题收到状态后重建相关缓存，通过 `state.theme_color` 报告实际采用的配色。`theme.appearance` 为保存值，`theme.rendered_appearance` 为当前面板回报值。不要重映射 `RGB`／`RGBA`：封面及透明遮罩的字面黑白必须保持原值。

切换时清理场景、菜单、弹窗、卡片、骨架、圆角及坐标系位图，并更新频谱的轴线和峰值色。原生歌词宿主通过 SDK 颜色回调及通知同步背景、文字和强调色；`ui_color_darkmode` 按 SDK 约定使用黑色表示深色、白色表示浅色。外观操作不修改歌曲、轮次、窗口尺寸、字体或音频输出。独立插件版不提供主题切换命令。

完整版的默认窗口面积为所在显示器工作区的 40%，排除任务栏。原生 `state.display` 提供 `work_left`、`work_top`、`work_width`、`work_height`，由 `MonitorFromWindow` 和 `GetMonitorInfoW` 获取，不依赖主屏幕分辨率。

主题依据屏幕比例选取适合三栏的 1.45–1.85 纵横比；竖屏会进一步调整，以保持目标面积并限制单边不超过工作区的 94%。首次启用该规则及设置页恢复时应用并居中；日常启动、切换显示器和普通状态更新保留用户尺寸。缺少工作区信息时等待有效状态，不写入初始化标记。密度计算中的设计画布尺寸仅用于缩放字体和内容，不是窗口默认尺寸。

底栏歌曲信息区随窗口宽度扩展，不设置固定宽度上限；中部传输控制继续依据左右实际内容保留空间。上部分隔线保持不随密度缩放的单像素宽度，使用不透明、低对比度配色；拖动命中范围独立于线条宽度。

## 安装与发行

```powershell
.\scripts\package-public.ps1
```

在 `dist/public-release/` 生成 `full`、`core` ZIP、原生组件包和 `SHA256SUMS.txt`。两个 ZIP 在根目录带 `edition.json`，安装后将类型记录到 `profile/smartshuffle/installation.json`，供更新选择使用。

字体在 `before_config_read` 阶段通过 `AddFontResourceExW(FR_PRIVATE)` 加载，使 GDI 与主题在初始化时可使用 Inter。字体文件位于个人配置的 `smartshuffle/fonts/`，单独组件包也提供组件内的备用字体目录。不写系统字体注册表。

`full` 安装主题、UI Wizard 及完整运行时，并将支持的字体配置迁移为微软雅黑 UI。`core` 只安装原生组件、运行时、项目窗口字体及类型标记。单独的组件包使用原生偏好窗口，分析运行时另装。

版本号集中于 `src/version.hpp`；主题握手及测试期望需同步调整。包脚本读取原生版本，README 和发行说明写对应版本。发布使用草稿上传全部资源，确认两版上传完成后再公开，避免启动检查获取半成品。

发行说明只保留用户能理解的改动。测试命令见 [测试说明](verification.md)；包含用户环境信息的执行报告留在本地 `build/`。


## 交互绘制与界面切换

指针移动只记录小球目标，约每 16ms 合并一次绘制；偏好预览仍独立延迟约 150ms。静态面板与文字缓存为位图，每帧恢复后绘制小球，拖尾按时间插值采样并在 120ms 内消散。帧合并参考 [Motion frame](https://motion.dev/docs/frame) 与 [batcher 源码](https://github.com/motiondivision/motion/blob/main/packages/motion-dom/src/frameloop/batcher.ts)。曲目拖动从静态场景克隆整行作为浮层，原位置保留占位；采用长按激活，超过移动阈值但未到长按时间的手势也会消费释放事件，防止误播放。浮层思路参考 [dnd-kit Drag Overlay](https://dndkit.com/legacy/api-documentation/draggable/drag-overlay/)，不引入这些库。

`play_playlist` 接受歌单 GUID，由原生 Engine 验证非内部歌单及非空内容。智能模式继续剩余集合，手动插队保留；重复点击正在播放的来源不会重开轮次。主题不自行生成顺序。

`play_library` 直接读取 SDK 音乐库，不通过桥接传输全量曲目，也不合并仅出现在歌单内的文件。使用独立隐藏来源 `__smartshuffle_library__`，与歌手／搜索结果的 `__verdant_np__` 分开轮次；停止后清理临时来源。长按由已收到的鼠标按下／松开事件确定，移动事件提供的左键标志用于检测丢失的松开；不以全局按键轮询作为起拖条件。事件参数参见 [JSplitter 鼠标回调](https://dima-lur.github.io/jsplitter/module-Callbacks.html#on_mouse_move)。

完整版的一键原版／新版切换由 `scripts/switch-mode.ps1` 正常退出目标实例，再由 `switch_mode.py` 在离线状态保存当前界面分支并应用另一分支，最后重启。原版基线只从同一目标最早的、安装前组件不存在的有效备份建立；升级不覆盖基线。界面文件与白名单 SQLite 行分支保存，歌单、统计、音频输出不进入分支。原版启动只保留切换入口，不创建 Engine、分析、联网任务或加载私有字体。不要把个人基线打进发行包。

## 软件内更新

`update_install` 是用户确认下载、安装并重启的新命令；保留旧 `update_download` 的浏览器下载语义以兼容 bridge v1。检查、下载分别使用后台任务；状态通过 `update.phase`、`downloaded`、`total` 和 `last_result` 提供，重复动作合并。没有点击安装动作时，不会退出播放器。

下载使用异步 WinHTTP 请求，按流校验 SHA-256 和字节数。取消只通知工作线程，由同一请求所有者在发起 API 返回后关闭句柄，并等待最后的 `HANDLE_CLOSING` 回调，再释放上下文及缓冲区；参见 [WinHTTP 并发要求](https://learn.microsoft.com/windows/win32/winhttp/concurrency-in-winhttp)。

已安装的 `update-helper` 五个文件先复制到任务目录，独立助手从该副本运行，避免安装过程中替换自身。安装包里的脚本不会导入或执行。准备阶段完成路径、类型、哈希和 ZIP 检查后才退出目标；离线阶段重新验证并持有读取锁，再调用本地安装器。安装器备份助手和受影响文件，配置快照排除下载任务目录。更新结果可在重新启动后读取。
