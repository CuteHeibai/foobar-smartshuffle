# 测试说明

## 快速检查

在仓库根目录运行：

```powershell
.\scripts\build.ps1 -TestsOnly
node tests/theme_tests.js
node tests/theme_regressions.js
node tests/theme_color_tests.js
node tests/ui_geometry_regressions.js
node tests/selection_regressions.js
node tests/playlist_play_tests.js
node tests/all_songs_play_tests.js
node tests/footer_marquee_tests.js
node tests/scroll_preferences_tests.js
.\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test*install.py' -v
python -m unittest discover -s tests -p test_switch_mode.py
python -m unittest discover -s tests -p test_update_apply.py
```

原生测试覆盖轮次完整性、去重、偏好方向、持久化、焦点策略和更新包选择。主题测试覆盖坐标、草稿、布局、滚动、多选及菜单行为。安装测试检查界面保留、备份、回滚及路径范围。

网络和音频检查分别运行：

```powershell
.\build\update_tests.exe --online
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_analyzer.py -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_metadata.py -v
```

## 宿主测试

`fixture.vcxproj` 生成仅供独立播放器副本使用的 `foo_ssfixture.dll`。`tests/host_*.py` 经 SDK 接口检查播放、插队、CUE、失败停止、窗口状态、设置和临时列表清理。`tests/host_ui_render.py` 使用 JSplitter 离屏位图检查字体与绘制边界。`tests/host_updates.py` 检查启动更新和独立偏好窗口。

`tests/host_theme_appearance.py` 自行启停测试副本，检查深浅切换、主题与歌词颜色确认、保存及重启恢复，并保留原有轮次和窗口尺寸；运行前先退出测试副本。浅色菜单、圆角和坐标系的实际位图包含在 `host_ui_render.py` 中。

这些脚本只应针对项目的 `test-player/` 运行。完成后执行 `tests/host_cleanup.py` 并正常退出副本，不把测试组件带入日常安装。

`host_all_songs_play.py` 在已运行、使用空输出的副本内检查 SDK 音乐库播放、歌手／搜索结果来源隔离、暂停续播、插队和临时列表清理。可通过 `SS_LIBRARY_PROFILE` 选择项目的 `build/core-player/profile` 检查空库拒绝路径。`host_ui_render.py` 还检查长标题位图裁切、分隔线的实际单像素覆盖和 2560×1440 栏位缩放帧的绘制次数与耗时。

`host_pointer_hold.py` 自行启停测试副本，通过完整脚本鼠标回调、真实 JS 定时器、普通及允许排序的智能歌单与 GDI 浮层检查长按和原生排序指令；只临时创建测试歌单，不模拟鼠标输入，也不修改音频文件。

`host_update_bootstrap.py` 要求先在测试副本放入基于旧版源码的更新补丁、旧版主题和本地助手，检查只新增内置更新入口、下载进度与取消退出。`host_in_app_update.py --target-version <已发布版本>` 会实际从 GitHub 下载、正常退出、备份、安装并重新打开测试副本，再核对播放状态和输出。两者都会自行启停副本，运行前先退出副本并选择空输出；不针对日常播放器运行。

播放检查先将测试副本设为空输出，避免占用日常使用的音频设备。`host_playlist_play.py` 要求副本已经运行，使用生成的 WAV 检查整张歌单播放、暂停续播、重复点击、插队接回及原生模式。`host_integration_switch.py --original-backup <安装前备份目录>` 自行启停副本，经原生菜单执行两次切换，检查原版后台停用、新版布局恢复以及当前歌单、轮次、音频输出保留。它只读取输入备份，将必要界面内容复制到测试副本。

`host_drag_frames.py` 自行启停独立副本，在 2560×1440 离屏位图上测量歌曲浮层帧耗时、刷新请求派发延迟和整页重建次数。它直接调用脚本鼠标回调，不发送系统鼠标输入；测量结果保留在本地 `build/drag-frames-acceptance.json`。

`host_scroll_frames.py` 在独立副本内检查每格滚轮距离、可见行边界和真实 `on_paint` 回调耗时；等待启动与封面预热后再测，不在计时回调中额外绘制第二帧。它不模拟系统鼠标输入，数据保存在本地 `build/scroll-frames-acceptance.json`。

## 发布检查

- 两版均能加载原生组件，启动更新不阻塞播放；离线、无更新和发现更新三种状态行为正确。
- 独立版在没有界面依赖的副本内打开二维窗口；拖动只改草稿，取消保留顺序，应用与预览一致。
- 完整版保留歌词默认显示、原生菜单和音频输出。大窗口、小窗口与高 DPI 下文字和图像留在各自区域内。
- 安装、升级和恢复保留应保留的设置；独立版不改字体和界面。
- 安装包不包含个人缓存、路径、测试组件或无分发许可的第三方文件；校验值与上传资源一致。

鼠标手感、设备输出及显示器上的视觉效果在对应环境中检查。单元测试和离屏绘制各自覆盖其测试目标。
