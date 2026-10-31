# foobar2000 二维随机偏好

给本地歌单一个可以拖动的随机偏好小球：**左边少听、右边常听，上方风格跳跃、下方风格相似。** 两轴可以组合，中心为均衡随机；所有位置都保持每轮全覆盖、不放回抽样。

包含原生组件 `foo_smartshuffle`、中文黑灰绿 Verdant 主题和独立本地音频分析工具。当前为 **v1.0.4 测试版**，实际验证环境为 Windows、foobar2000 **2.25.8 x64 便携版**。其他版本、标准安装及不同组件组合尚未验证。

[下载测试版](https://github.com/CuteHeibai/foobar-smartshuffle/releases/tag/v1.0.4) · [反馈问题](https://github.com/CuteHeibai/foobar-smartshuffle/issues) · [验证记录](docs/verification.md)

## 能做什么

- 拖动二维小球，预览前 8 首真实待播歌曲；约 150ms 后刷新。“应用”提交完整剩余顺序，“取消”保持原顺序。
- 支持方向键、均衡/常听/少听快捷位置；同次调整采用固定随机种子，便于比较不同偏好。
- 每个歌单独立保存位置、轮次和进度；跳过算已尝试，主动重播、上一首和单曲循环是重复例外。手动插队优先，之后接回本轮。
- 临时播放来源和内部托管歌单在停止或不再使用后自动清理，原歌单及其轮次保留。
- 频率使用已有累计次数及安装后的近 30 天有效收听记录；不补造安装前的近期历史。
- 使用 foobar 解码器提取音频片段，结合 65 维声学特征及标签计算风格。分析在本地、低优先级后台进行，可暂停及继续，结果缓存复用，不写音乐文件标签。
- 中文主题默认显示第一栏 ESLyric 歌词，支持切换真实队列；播放模式与随机偏好合并为一个菜单，保留原生歌曲右键及插件子菜单。音频输出读取已有 WASAPI/ASIO 设备，不提供硬件驱动。
- 半透明小球带短拖尾、渐变坐标系及切换动画；窗口首次以 1180×780 打开，之后保留手动大小。主题、Columns UI 字体角色和已识别的 ESLyric 字体配置统一为 Segoe UI，中文由系统回退；不附带 Spotify 专有字体。
- 搜索支持中文拼音/首字母、日语罗马音、近似拼写及本地歌词片段，在后台建立本地索引。每次打开歌手页静默联网核验身份并下载独立头像；先显示本地缓存，同名无法确认时保留待核验状态，不以专辑图冒充头像。见[搜索与歌手资料](docs/search-artists.md)。
- 最大化时的歌曲悬停只更新旧行、新行并合并到一帧；缓存画面的文字使用灰度抗锯齿。新建歌单的双行文字按实测高度排布。
- 智能队列及歌曲列表右键可将实际歌曲文件移到回收站，需确认完整路径；共享子曲目文件会提示整文件影响，外部 CUE 暂不支持该操作。
- 拖动栏间分隔线可调整音乐库、主内容、歌词／队列及底部各区域宽度，自动保存。播放模式菜单中的“插件设置…”或“参数选项 → 工具 → 智能随机”提供“一键恢复默认布局”，恢复宽度和窗口大小，保留歌单、听歌记录及播放设置。
- 歌单、歌曲与右侧待播队列支持拖动排序。左键拖选、Ctrl 点选、Shift 范围选择后，右键批量复制／移动到现有或新歌单，或使用原生转换器。智能／锁定歌单只允许复制；歌单标题区可批量添加文件夹。
- 双击单曲将它插到右侧队列最前并立即播放，原有插队内容随后继续；歌词搜索结果单击仍用于播放并定位对应时间。播放模式菜单精简为顺序、列表循环、单曲循环和智能随机。
- 每次启动后台检查缺少封面的歌曲，按专辑查找 MusicBrainz / Cover Art Archive 并缓存到个人配置目录，不写标签或音乐文件。已有封面优先，同名专辑无法确认时不下载。内置 355 条常用插件菜单与标准设置控件翻译，保留第三方自绘界面的实际覆盖边界。详见[列表操作与汉化](docs/editing-and-covers.md)。
- 文字按实际区域约束字号，头像占位字保留在圆内；列表使用独立视口避免覆盖标题封面。歌曲和队列平滑滚动，滚轮随鼠标所在组件路由；前台悬停转移焦点，输入与拖动期间保留焦点。右下角不再显示分析数量和暂停／继续入口。

这是本地声学相似度与随机权重调整，不连接网易云推荐服务，也不承诺复现其算法。界面改编自 [superziper/Verdant](https://github.com/superziper/verdant-foobar2000-theme)，并非 Spotify 或网易云官方产品。

## 下载与安装

建议先复制一份便携版 foobar 测试。公开桌面包包含插件、主题、分析运行时、MIT 许可的 UI Wizard 窗口组件和安装脚本，**不包含 foobar 主程序、Columns UI、JSplitter 或修改版 ESLyric DLL**。

1. 准备 foobar2000 2.25.8 x64 便携版，以及可运行的 Python 3.9+（安装/恢复脚本需要，音频运行时已独立打包）。
2. 在该副本中安装 [Columns UI](https://www.foobar2000.org/components/view/foo_ui_columns) 和兼容的 JSplitter。本项目已验证 JSplitter 4.3.4；可参照 [Verdant 上游安装说明](https://github.com/superziper/verdant-foobar2000-theme) 获取组件。使用原生歌词面板还需自行安装 ESLyric。
3. 从 Releases 下载 `foobar-smartshuffle-desktop-1.0.4.zip`，解压后运行：

```powershell
.\scripts\install-public.ps1 -FoobarRoot 'D:\Apps\foobar2000'
```

安装器正常退出目标播放器，备份配置与歌单，安装后切换为中文 Columns UI 主题并重新打开。保留现有输出和音量。独占输出会占用对应设备，ASIO 是否可用取决于系统中实际安装的驱动。

只下载 `.fb2k-component` 可安装原生调度组件；它不包含二维主题界面或音频分析运行时。想使用完整功能，请用桌面包。

备份位于目标 foobar 目录 `smartshuffle-backups/<时间>/`。需要回退时，运行对应备份的 `restore.ps1`，还原安装前的界面、歌单及受影响组件。

## 使用

点击底部播放模式菜单（默认“智能随机”），选择“调整随机偏好…”打开面板，拖球后确认预览，再点“应用”。同一个菜单也能切换 foobar 原生播放模式。方向键每次移动 0.05，Esc 取消，Enter 在预览准备完成后应用。播放或歌单变动会使旧预览失效，需要等待刷新后再次应用。

风格排序依赖已完成的分析；尚未分析的曲目使用已有标签，两者都缺失时保持中性。首次分析可能需要时间。精确动态风格排序为 O(n²×特征数)，超大歌单未验证即时响应。

## ESLyric / NVIDIA 实验

仓库另附 [ESLyric 调查](docs/eslyric-investigation.md) 和 `scripts/patch-eslyric.ps1`，仅支持文中 SHA-256 完全匹配的 1.0.6.7 原版；脚本只生成本地副本。软件渲染候选在本机 A/B 中未加载观察到的 NVIDIA 覆盖层模块，最终可见效果仍需人工确认。公开安装不运行该实验、不替换歌词组件。

## 构建与测试

需要 Visual Studio 2022 C++ v143、Windows SDK 10.0.22621.0、Node.js；分析工具构建使用隔离的 Python 3.13 环境。

```powershell
.\scripts\fetch-deps.ps1
.\scripts\build.ps1 -TestsOnly
.\scripts\build.ps1
.\scripts\build-analyzer.ps1
node tests/theme_tests.js
node tests/theme_regressions.js
python -m unittest discover -s tests -p test_install.py -v
python -m unittest discover -s tests -p test_profile_style.py -v
.\scripts\package-public.ps1
```

核心 16 组 / 25,278 项断言、主题 20 个接口测试、32 个交互回归、字体配置 13 个测试、音频 10 个测试、搜索/资料 18 个测试和安装 3 个测试通过。真实 foobar 副本还验证了整轮播放、插队、自然续轮、CUE、失败处理、重启续接、窗口接口、播放模式交接、插件设置页和恢复。视觉、高 DPI、鼠标手感及主观听感未完成自动验收，完整范围见 [验证记录](docs/verification.md)。

`fixture.vcxproj` 和 `tests/host_*.py` 仅用于项目 `test-player` 副本，测试组件不会包含在公开安装包中。

## 许可与致谢

本项目自有源码采用 [MIT](LICENSE)。Verdant 主题保留原作者许可；foobar SDK、PFC、nlohmann JSON 和分析运行时依赖保持各自许可，详见 [第三方声明](THIRD-PARTY-NOTICES.md)。SDK 和第三方 UI 组件不包含在源码仓库中。
