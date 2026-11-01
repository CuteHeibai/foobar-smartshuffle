# ESLyric 软件渲染工具

`scripts/patch-eslyric.ps1` 可为指定的 ESLyric 1.0.6.7 x64 原版生成 WARP 软件渲染副本，用于排查歌词窗口触发 NVIDIA 覆盖层的问题。

工具校验文件版本、长度、SHA-256 和指令上下文，只写入项目的 `build/eslyric/`，不覆盖输入 DLL。它仅支持以下原版：

```text
SHA-256: ac2e2c8fa2a481c8c217ce53d57f2bd8582c771bf75deab888207e43af43c583
Length: 5830144
```

```powershell
.\scripts\patch-eslyric.ps1 -SourcePath 'D:\Apps\foobar2000\profile\user-components-x64\foo_uie_eslyric\foo_uie_eslyric.dll'
```

修改位于文件偏移 `0x26015`，将对应 D3D 设备创建参数改为 WARP。原版与生成文件分别保存在 `foo_uie_eslyric.original.dll` 和 `foo_uie_eslyric.dll`。输入不匹配时脚本拒绝生成文件。

[ESLyric](https://github.com/ESLyric/release) 使用 Direct2D／DirectWrite。软件渲染会改变图形设备路径，但 NVIDIA 的覆盖层识别还取决于驱动版本和覆盖层配置，不能仅凭渲染模式保证关闭覆盖层。

建议在单独播放器副本中对比歌词显示、CPU 占用和覆盖层行为，再决定是否使用；回退时换回原版。该工具不随公开安装器执行，发行包不包含修改后的 ESLyric DLL。
