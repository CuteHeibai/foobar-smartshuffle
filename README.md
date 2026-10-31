# foobar2000 二维随机偏好

适用于本机 foobar2000 2.25.8 x64，包含原生 `foo_smartshuffle`、中文 Verdant 主题和独立本地音频分析工具。

## 使用

- 点击底部“随机偏好”：左边少听、右边常听、上方风格跳跃、下方风格相似。中心为均衡随机。
- 拖动只更新预览；“应用”才改变本轮剩余顺序，“取消”保留原顺序。方向键每次移动 0.05，Esc 取消，Enter 在预览准备完成后应用。
- 每轮自动播放当前歌单内每首歌曲一次。跳过计入本轮，主动重播和上一首允许重复；播放完成重新洗牌，退出后保存轮次。
- 待播区显示真实顺序，手动队列优先。扫描可暂停、继续、重试，首次分析在后台进行。
- “音频输出”按 foobar 实际设备列表切换。Lian II 的共享与独占输出均属于 WASAPI；独占会占用该设备，其他应用暂时不能同时使用它。安装保留现有输出和音量。
- 系统已安装 ASIO 2.2.4 和 ASIO+DSD 0.4.7；本机只有 Voicemeeter ASIO 驱动，未发现 Lian II 原生 ASIO 驱动。

## 本地安装与恢复

完整交付包解压后执行 `scripts/install.ps1`，默认目标 `C:\Program Files\foobar2000`，会正常退出目标程序后安装并重新打开。依赖本机现有 Python 和 JSplitter。组件、主题和分析运行时均包含在完整包内。

安装备份位于 foobar 根目录 `smartshuffle-backups/<时间>/`，含完整 profile 快照、受影响文件清单及 `restore.ps1`。运行该脚本会还原安装前的界面、歌单和相关组件。音乐文件不改写。

本机已安装并重新打开；本次备份为 `C:\Program Files\foobar2000\smartshuffle-backups\20261031-174108-321976`。当前输出保持 Lian II WASAPI 独占。测试与观察边界见 [验证记录](docs/verification.md)。

ESLyric 1.0.6.7 的本地候选补丁将首次 D3D11 设备创建改为 WARP 软件渲染。补丁只适用于调查中精确匹配的版本；原件在备份中。调查和同路径 A/B 模块结果见 `docs/eslyric-investigation.md`。可用 `-SkipESLyric` 跳过该项。

## 构建与检查

1. `scripts/fetch-deps.ps1` 获取固定版本的 foobar SDK 2025-03-07 和 nlohmann JSON 3.11.3。
2. `scripts/build.ps1 -TestsOnly` 运行 C++ 调度测试；`scripts/build.ps1` 用 Visual Studio 2022 C++ v143 构建原生组件。
3. `scripts/build-analyzer.ps1` 构建独立音频分析工具；不改变全局 Python。
4. `node tests/theme_tests.js`；`python -m unittest discover -s tests -p test_install.py -v`。
5. `scripts/patch-eslyric.ps1` 只生成 ESLyric 候选副本；`scripts/package.ps1` 生成完整本地包和 `.fb2k-component`。

`tests/native_acceptance.py` 只操作项目 `test-player` 副本，要求它已运行；不会指向日常使用的安装目录。

`fixture.vcxproj` 是仅用于副本测试的 SDK 驱动器；`tests/host_workflow.py` 验证自然播放、插队、上一首、停止和真实 CUE 解码，`tests/host_failures.py` 验证损坏文件跳过和整轮失败停止，`tests/host_restart.py` 验证正常重启续接。测试驱动器不安装到日常播放器。

已验证：核心 25,278 项断言、20 个主题接口测试、10 个音频分析测试、3 个安装测试，独立 foobar 中的真实播放及恢复。按用户要求未使用 Computer Use，鼠标拖动的视觉效果、高 DPI 和实际听感需由用户观察。

## 实现

原生组件拥有轮次、有效收听统计、实际顺序和预览修订号。主题通过本地版本化 JSON 接口控制它；关闭面板后调度继续。偏好预览在后台线程计算。

风格依据本地音频片段的 65 维声学特征，结合已有歌曲标签。它表示本地声学相似度，不是网易云的服务端推荐算法。旧统计没有的近期记录不补造。

主题改编自 superziper 的 [Verdant](https://github.com/superziper/verdant-foobar2000-theme)，保留其 MIT 许可及第三方声明。Columns UI 保留 LGPL/GPL 许可文本；foobar SDK 需从官方单独获取。仅供本机使用，未发布。
