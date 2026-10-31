# 搜索与歌手资料

搜索框支持歌曲、歌手、专辑文字、中文拼音/首字母、日语汉字及假名的罗马音、拉丁字母的近似拼写，以及已有本地歌词。结果区会显示命中的歌词片段。收录音乐库及非内部歌单中的曲目；相同路径及子曲目去重。

- 例如 `zhou jie lun` / `zjl` 查找“周杰伦”，`seishun` 查找“青春”，`konpurekkusu` 查找“コンプレックス”。
- 歌词来自文件已有歌词标签、音频旁同名 LRC/TXT、`profile/lyrics` 下的“歌手 - 歌名”、歌名及歌手子目录文件；支持时间戳歌词及 UTF-8、UTF-16。没有现成本地歌词的歌曲不能凭空命中。搜索不会为全库联网下载歌词。
- 多词共同匹配；文字优先于音译和近似拼写，歌词结果显示片段。拼音和日语读法由本地词典推断，生僻读法、艺名及多音字可能需要使用原文搜索。
- 输入约 220ms 后在独立低优先级进程中检索，本地 SQLite 复用索引；旧查询结果不会覆盖新输入。歌曲、标签或歌词文件变动后重新检索会更新相关索引。

每次打开歌手页，先显示本地缓存，同时静默联网核验身份并下载独立头像。不会以专辑封面冒充歌手头像，也不会修改音乐文件的标签。

1. 优先使用文件已有的 MusicBrainz artist ID；没有时检索姓名和别名。
2. 同名候选结合专辑发行的歌手署名确认，必要时用 Wikidata 姓名、别名与 MusicBrainz ID 交叉核对；仍无法区分时保留原缓存，标为待确认，不根据热门程度猜身份。
3. 已确认的姓名、MBID、资料来源、更新时间、头像来源、作者和许可保存到本地。网络失败继续显示缓存；肖像缺失时可采用该身份的独立标识图；均缺失时显示文字占位图。
4. 需要人工确认或重新核验时，右键歌手卡片，或点击歌手页“歌手资料 / 联网核验”。

本地文件位于 `profile/smartshuffle/artists.json`、`artist-portraits/`、`search.sqlite`。它们不随公开安装包分发。

歌手页联网会向 [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) 发送歌手姓名、已有标识及用于辨别同名者的专辑名称；通过 [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access) 的图像条目定位头像，从 [Wikimedia Commons](https://www.mediawiki.org/wiki/API:Imageinfo) 获取图片及署名/许可。不会上传音频、播放次数或歌词。服务不可用或资料缺失时不保证能取得头像。

主题文字使用适用于缓存画面的 GDI+ 灰度抗锯齿，避免将 ClearType 字体直接画到离屏图像造成伪影；参见 [绘图接口说明](https://theqwertiest.github.io/foo_spider_monkey_panel/assets/generated_files/docs/html/GdiGraphics.html#GdiDrawText)。新建歌单的双行文字按实测字体高度及留白排布，空间不足时显示一行。

肖像缺失时，读取 MusicBrainz 所关联的 Spotify **歌手**页面，通过 [Spotify oEmbed](https://developer.spotify.com/documentation/embeds/reference/oembed) 获取该身份的独立头像，不读取歌曲或专辑缩略图。也可保留经核验的官方标识。Spotify 图片仅保存在用户本机缓存，不进入公开发行包；这不授予图片的开放再分发许可。
