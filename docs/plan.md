# foobar2000 二维随机偏好实施计划

用户已批准本聊天中的完整计划。目标：本机 foobar2000 2.25.8 x64 原生调度插件、可拖动二维随机偏好、真实队列预览、本地音频分析和中文 Verdant 主题。

## Task 1: Portable scheduling core
实现 C++20 标准库调度与轮次核心，独立于 SDK，使用 nlohmann JSON 序列化。测试先行验证覆盖、频率和风格轴、预览事务、歌单编辑和恢复。

## Task 2: Native component and analysis
SDK 2025-03-07，VS2022 v143 x64；原生组件持有歌单 GUID、轮次和内部播放列表，通过主线程调度，不改写用户原歌单。SDK 解码样本，独立 Python 分析工具提取特征。按版本化 JSON 文件请求和原子响应与 JSplitter 通信，固定菜单命令触发处理。

## Task 3: Chinese Verdant theme
移除主题旧乱序，连接唯一原生调度。中文黑灰绿界面，二维球、8 首预览、应用取消、150ms 延迟、键盘操作、待播与歌词。

## Task 4: Integration and delivery
自动化核心及音频测试，原生加载和独立播放器接口验收，备份后本机部署、恢复验证，交付源码及安装包。用户后续已授权公开到 GitHub；Bilibili 动态提供草稿，由用户自行操作。禁止 Computer Use。

## Global constraints
每轮全覆盖；路径加子曲目去重；播放开始和跳过计入本轮；主动重播允许例外；各歌单独立持久化；重启续接；默认轮播；末首首曲不连续重复。二维 x 左少听右常听，y 上跳跃下相似。中心无偏好，不放回抽样。有效收听 min(60秒,时长/2)，seek/pause 不计。频率 log1p(C)+2log1p(R30)。风格音频为主标签为辅，缺失中性。预览期间不影响播放，应用核验修订号，取消无副作用。
