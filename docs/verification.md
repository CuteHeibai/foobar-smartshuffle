# 测试说明

## 快速检查

在仓库根目录运行：

```powershell
.\scripts\build.ps1 -TestsOnly
node tests/theme_tests.js
node tests/theme_regressions.js
node tests/ui_geometry_regressions.js
node tests/selection_regressions.js
.\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test*install.py' -v
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

这些脚本只应针对项目的 `test-player/` 运行。完成后执行 `tests/host_cleanup.py` 并正常退出副本，不把测试组件带入日常安装。

## 发布检查

- 两版均能加载原生组件，启动更新不阻塞播放；离线、无更新和发现更新三种状态行为正确。
- 独立版在没有界面依赖的副本内打开二维窗口；拖动只改草稿，取消保留顺序，应用与预览一致。
- 完整版保留歌词默认显示、原生菜单和音频输出。大窗口、小窗口与高 DPI 下文字和图像留在各自区域内。
- 安装、升级和恢复保留应保留的设置；独立版不改字体和界面。
- 安装包不包含个人缓存、路径、测试组件或无分发许可的第三方文件；校验值与上传资源一致。

鼠标手感、设备输出及显示器上的视觉效果在对应环境中检查。单元测试和离屏绘制各自覆盖其测试目标。
