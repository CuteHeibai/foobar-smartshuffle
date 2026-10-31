# foobar2000 二维随机偏好

给本地歌单一个可以拖动的随机偏好小球：**左边少听、右边常听，上方风格跳跃、下方风格相似。** 两轴可以组合，中心为均衡随机；所有位置都保持每轮全覆盖、不放回抽样。

包含原生组件 `foo_smartshuffle`、中文黑灰绿 Verdant 主题和独立本地音频分析工具。当前为 **v1.0.0 测试版**，实际验证环境为 Windows、foobar2000 **2.25.8 x64 便携版**。其他版本、标准安装及不同组件组合尚未验证。

[下载测试版](https://github.com/CuteHeibai/foobar-smartshuffle/releases/tag/v1.0.0) · [反馈问题](https://github.com/CuteHeibai/foobar-smartshuffle/issues) · [验证记录](docs/verification.md)

## 能做什么

- 拖动二维小球，预览前 8 首真实待播歌曲；约 150ms 后刷新。“应用”提交完整剩余顺序，“取消”保持原顺序。
- 支持方向键、均衡/常听/少听快捷位置；同次调整采用固定随机种子，便于比较不同偏好。
- 每个歌单独立保存位置、轮次和进度；跳过算已尝试，主动重播、上一首和单曲循环是重复例外。手动插队优先，之后接回本轮。
- 频率使用已有累计次数及安装后的近 30 天有效收听记录；不补造安装前的近期历史。
- 使用 foobar 解码器提取音频片段，结合 65 维声学特征及标签计算风格。分析在本地、低优先级后台进行，可暂停及继续，结果缓存复用，不写音乐文件标签。
- 中文主题显示真实队列、扫描进度和歌词入口；音频输出菜单读取 foobar 已有设备，支持选择已有 WASAPI/ASIO 输出，不提供硬件驱动。

这是本地声学相似度与随机权重调整，不连接网易云推荐服务，也不承诺复现其算法。界面改编自 [superziper/Verdant](https://github.com/superziper/verdant-foobar2000-theme)，并非 Spotify 或网易云官方产品。

## 下载与安装

建议先复制一份便携版 foobar 测试。公开桌面包包含插件、主题、分析运行时和安装脚本，**不包含 foobar 主程序、第三方 UI 组件或修改版 ESLyric DLL**。

1. 准备 foobar2000 2.25.8 x64 便携版，以及可运行的 Python 3.9+（安装/恢复脚本需要，音频运行时已独立打包）。
2. 在该副本中安装 [Columns UI](https://www.foobar2000.org/components/view/foo_ui_columns) 和兼容的 JSplitter。本项目已验证 JSplitter 4.3.4；可参照 [Verdant 上游安装说明](https://github.com/superziper/verdant-foobar2000-theme) 获取组件。使用原生歌词面板还需自行安装 ESLyric。
3. 从 Releases 下载 `foobar-smartshuffle-desktop-1.0.0.zip`，解压后运行：

```powershell
.\scripts\install-public.ps1 -FoobarRoot 'D:\Apps\foobar2000'
```

安装器正常退出目标播放器，备份配置与歌单，安装后切换为中文 Columns UI 主题并重新打开。保留现有输出和音量。独占输出会占用对应设备，ASIO 是否可用取决于系统中实际安装的驱动。

只下载 `.fb2k-component` 可安装原生调度组件；它不包含二维主题界面或音频分析运行时。想使用完整功能，请用桌面包。

备份位于目标 foobar 目录 `smartshuffle-backups/<时间>/`。需要回退时，运行对应备份的 `restore.ps1`，还原安装前的界面、歌单及受影响组件。

## 使用

点击底部“随机偏好”打开面板，拖球后确认预览，再点“应用”。方向键每次移动 0.05，Esc 取消，Enter 在预览准备完成后应用。播放或歌单变动会使旧预览失效，需要等待刷新后再次应用。

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
python -m unittest discover -s tests -p test_install.py -v
.\scripts\package-public.ps1
```

核心 16 组 / 25,278 项断言、主题 20 个接口测试、音频 10 个测试、安装 3 个测试通过。真实 foobar 副本还验证了整轮播放、插队、自然续轮、CUE、失败处理、重启续接及恢复。视觉、高 DPI、鼠标手感及主观听感未完成自动验收，完整范围见 [验证记录](docs/verification.md)。

`fixture.vcxproj` 和 `tests/host_*.py` 仅用于项目 `test-player` 副本，测试组件不会包含在公开安装包中。

## 许可与致谢

本项目自有源码采用 [MIT](LICENSE)。Verdant 主题保留原作者许可；foobar SDK、PFC、nlohmann JSON 和分析运行时依赖保持各自许可，详见 [第三方声明](THIRD-PARTY-NOTICES.md)。SDK 和第三方 UI 组件不包含在源码仓库中。
