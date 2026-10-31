# Native ESLyric embedding

Implemented `src/lyrics_host.hpp` and `src/lyrics_host.cpp` with the requested `native_ss::LyricsHost` interface. The parent integrates these sources into the native project and calls them from foobar2000's main thread.

The host enumerates the SDK's `ui_element` services, selects the element named `ESLyric` (ASCII case-insensitive), obtains its default configuration, and calls `instantiate(parent, config, callback)`. It embeds the actual ESLyric component, preserving that component's own online lyric search, download, display, and interaction behavior. This does not depend on the main UI being DefaultUI: the SDK instance is a regular child of the supplied theme panel. If ESLyric does not expose its element service in the running installation, status returns its discovery error rather than substituting a local LRC renderer.

## Lifecycle and input

- `update` accepts the requested native numeric parent HWND, integer x/y/w/h, and Boolean visible. It validates `IsWindow` and the parent process against the current process before hosting. The returned element HWND must also belong to this process, have `WS_CHILD`, and be parented to that exact theme HWND.
- Visible updates reuse the existing instance when the parent is unchanged, move/resize only that element child, and show it without activation. Hidden and zero-size requests do not create an instance. `{ "visible": false }` is also accepted for panel-unload cleanup without a parent handle.
- A changed parent releases the previous child/instance before creating the replacement. If a parent/child was destroyed, the next main-thread update/status poll releases the remaining service resources. Destruction explicitly destroys the owned child, releases the instance while callback/font resources remain valid, then orphans/releases the SDK callback and frees its font.
- SDK visibility and font/color notifications accompany the relevant changes. The receiver disables layout editing and declines activation when the lyric page is hidden; it never exposes an unrelated window or page.
- Host colors are background RGB(18,18,18), text RGB(225,225,225), highlight RGB(30,215,96), selection RGB(60,60,60), with dark mode reported. The font is Microsoft YaHei UI, 15 logical pixels at 96 DPI. Parent-window DPI changes replace the font with old and new handles alive during the SDK font-change notification.
- `GetDpiForWindow` is dynamically resolved because the supplied SDK targets a Windows version predating its declaration; fallback reads DPI from the validated parent window's own DC. This avoids changing SDK-wide target macros.
- `status()` returns `{ready,visible,error}`. No window lookup by captions, desktop enumeration, external-window reparenting, or unrelated process control is used.

## Compile verification

Compiled the translation unit successfully with Visual Studio 2022 Community developer prompt v17.14.3, x64 C++20, the actual shipped SDK, and warnings treated as errors:

```bat
cl /nologo /c /std:c++20 /EHsc /W3 /WX /O2 /MD /utf-8 /bigobj /DNDEBUG /DNOMINMAX /D_WINDLL /I vendor /I src src\lyrics_host.cpp /Fo:build\lyrics_host.obj
```

This produced `build/lyrics_host.obj`, exit code 0, with no compiler diagnostics. Per the task boundary, no native window API test, GUI automation, or Computer Use was executed. Runtime element discovery, actual ESLyric interaction, and visual sizing/color behavior still require host integration verification.
