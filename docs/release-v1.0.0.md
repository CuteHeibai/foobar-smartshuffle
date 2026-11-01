# v1.0.0 测试版

原生 foobar2000 二维随机偏好：按收听频率和风格变化拖动小球，在保持每轮全覆盖的前提下改变歌曲先后顺序。

- 二维连续偏好与前 8 首真实待播预览，应用/取消、固定预览种子、并发变动校验。
- 每歌单独立轮次和偏好、重启续接、手动插队优先、跨轮避免紧邻重复。
- SDK 按子曲目解码，本地 65 维声学分析、标签补充、缓存、低优先级扫描及暂停继续。
- 中文 Verdant 主题、真实队列与 ESLyric 歌词接入、现有音频输出选择。

## 下载

- `foobar-smartshuffle-desktop-1.0.0.zip`：完整功能桌面包，约 109 MiB。含自有组件、主题、分析运行时和备份安装/恢复脚本。
- `foo_smartshuffle.fb2k-component`：仅原生组件，不含二维主题或分析运行时。
- `SHA256SUMS.txt`：文件校验值。

公开桌面包不附带 foobar 主程序、Columns UI、JSplitter 或 ESLyric；请先自行安装依赖，再按 README 运行 `scripts/install-public.ps1 -FoobarRoot <便携版目录>`。公开安装不会修改 ESLyric，也不更改既有输出和音量。
