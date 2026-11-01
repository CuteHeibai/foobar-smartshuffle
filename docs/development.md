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

## 安装与发行

```powershell
.\scripts\package-public.ps1
```

在 `dist/public-release/` 生成 `full`、`core` ZIP、原生组件包和 `SHA256SUMS.txt`。两个 ZIP 在根目录带 `edition.json`，安装后将类型记录到 `profile/smartshuffle/installation.json`，供更新选择使用。

字体在 `before_config_read` 阶段通过 `AddFontResourceExW(FR_PRIVATE)` 加载，使 GDI 与主题在初始化时可使用 Inter。字体文件位于个人配置的 `smartshuffle/fonts/`，单独组件包也提供组件内的备用字体目录。不写系统字体注册表。

`full` 安装主题、UI Wizard 及完整运行时，并将支持的字体配置迁移为微软雅黑 UI。`core` 只安装原生组件、运行时、项目窗口字体及类型标记。单独的组件包使用原生偏好窗口，分析运行时另装。

版本号集中于 `src/version.hpp`；主题握手及测试期望需同步调整。包脚本读取原生版本，README 和发行说明写对应版本。发布使用草稿上传全部资源，确认两版上传完成后再公开，避免启动检查获取半成品。

发行说明只保留用户能理解的改动。测试命令见 [测试说明](verification.md)；包含用户环境信息的执行报告留在本地 `build/`。
