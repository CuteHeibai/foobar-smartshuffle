# 播放历史、收藏和稍后听

## 范围与决定

增加完整版的播放历史、收藏、稍后听三个左栏入口，复用现有主题、缓存行和原生队列。原生组件持有唯一数据，使用独立 personal.json，不写音频标签。历史只从启用后开始记录，保留最近90天、最多10000次播放事件；同一首重复播放保留独立事件。收藏和稍后听按路径及子曲目去重，稍后听不自动删除。原版界面模式维持插件停用。

## 接口约定

- snapshot.personal: revision, history_count, favorites_count, later_count, now_favorite, now_later。
- personal_list {kind:'history'|'favorites'|'later',offset:0,limit:50} -> response.personal: {kind,offset,total,revision,items}。单页最多100。
- items: {id,title,artist,album,duration}；历史增加 event_id,started_at,ended_at,listened,outcome,qualified；收藏/稍后听增加 added_at。
- personal_flags {tracks:[id]} -> response.personal_flags: [{id,favorite,later}]，最多256项。
- personal_set {kind:'favorites'|'later',tracks:[id],value:true|false}，批量去重与原子保存；无value仅允许单曲，按原生当前状态切换。
- 复用 queue_add {tracks:[id],play:true|false}、play_match、menu_open 的原生操作；浏览三个视图不切换播放来源。
- 页数据与成员状态按revision更新，不把完整历史放进常规状态文件；换页响应校验视图/偏移，忽略过期结果。

## 实施顺序

1. 原生纯存储模型与测试：版本校验、分页、去重、历史会话、实际时长与重启恢复。
2. Engine接入：SDK播放开始/切换/暂停/停止，后台持久化、轻量摘要与分页操作；保持现有调度独立。
3. 中文界面：三个入口、历史状态/时间、收藏/稍后听按钮、上下页、Ctrl多选、批量原生菜单与队列，保留缓存与视口边界。
4. 验证：模型、主题交互、实际SDK播放/暂停/跳过/自然结束、收藏去重与持久化、浏览不切源；检查安装备份/升级/恢复覆盖 personal.json。
5. 独立代码复查、统一版本与说明、两版打包核对；正常退出并备份本机后覆盖、重新打开并核对输出与现有歌单。

## 文件归属

- personal_store.hpp 与 personal_store_tests.cpp：纯JSON模型，可独立测试。
- native.cpp：SDK接入和接口；install.py：个人数据备份条目。
- data/personal.js 与 views/personal.js：分页、操作和渲染；app/nav/bar/selection_host：入口与既有行为接入。

## 验证边界

SDK与离屏GDI检查分别记录结果；物理鼠标和显示器体验由使用时确认。测试只在独立副本执行，发行包不包含测试组件或个人数据。
