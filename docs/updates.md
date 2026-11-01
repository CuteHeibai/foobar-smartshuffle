# 更新机制

两种发行版都由原生插件检查更新，不依赖主题。默认每次启动检查一次；也可以从“播放 → 随机偏好 → 检查更新…”手动检查或关闭启动检查。

使用 GitHub [Releases API](https://docs.github.com/en/rest/releases/releases#list-releases)，读取本仓库最近 100 个发布条目。版本标签格式为 `v主版本.次版本.修订号`，按数字比较。当前发行通道包含测试版，忽略草稿、非版本标签和没有完成上传的对应安装包。

安装类型保存在 `profile/smartshuffle/installation.json`。完整版选择 `foobar-smartshuffle-full-<版本>.zip`，独立版选择 `foobar-smartshuffle-core-<版本>.zip`。独立组件在没有类型标记和项目主题时按独立版处理。

请求使用 Windows HTTPS 客户端及系统代理，连接和读写设有超时，响应限制为 2 MiB。无更新时静默结束，网络错误可在更新窗口查看并重试。不会保存 GitHub 登录信息，也不需要令牌。关闭自动检查的设置保存在 `profile/smartshuffle/updates.json`。

发现更新后显示下载入口，点击后由系统浏览器下载对应安装包。解压并运行安装脚本完成升级，自动创建备份。更新检查不会执行远程脚本、自动退出播放器或直接覆盖运行中的 DLL。
