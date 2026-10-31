# Third-party notices

The root MIT license covers this project's original work. Third-party works retain their own copyrights and licenses.

- Chinese Verdant adaptation: [superziper/verdant-foobar2000-theme](https://github.com/superziper/verdant-foobar2000-theme), MIT. See `theme/verdant/LICENSE` and its upstream notices. No Spotify or NetEase endorsement is implied.
- Native component: foobar2000 SDK 2025-03-07 and its PFC/library support code, copyright Peter Pawlowski; notice texts are retained under `licenses/`. The SDK is fetched for builds, not checked into this repository.
- Native JSON: [nlohmann/json v3.11.3](https://github.com/nlohmann/json/tree/v3.11.3), MIT, copyright Niels Lohmann. Notice retained under `licenses/`.
- Window chrome: [UI Wizard](https://github.com/The-Wizardium/UI-Wizard), MIT, copyright (c) 2025 TT. The x64 component and its original LICENSE.txt are included under `payload/components/foo_ui_wizard` in the desktop archive, from Verdant's distributed dependency. It supplies caption movement, sizing and window controls.
- Analyzer: CPython and the distributions pinned in `analyzer/requirements.txt`, including NumPy, SciPy, librosa, soundfile/libsndfile and soxr/libsoxr. Each retains its original license. The public desktop archive includes the Python license, dependency metadata and license files collected from the exact build environment, plus notices already present in the bundled runtime. PyInstaller's license and bootloader exception are retained with its distribution metadata.
- Local phonetic search: pypinyin (MIT), SudachiPy (Apache-2.0), SudachiDict-small (Apache-2.0 and its original dictionary notices), and jaconv (MIT), pinned in the analyzer requirements. Their exact package licenses, metadata, and dictionary notices are included in the desktop runtime/notices.
- Optional artist verification uses MusicBrainz, Wikidata, Wikimedia Commons and MusicBrainz-linked Spotify artist oEmbed data at runtime. User-specific cached artist data/images are not redistributed in this archive; image author, source and license are retained alongside each cached portrait.
- Columns UI, JSplitter and ESLyric are user-installed dependencies. Their binaries are not included in the public release. The optional version-specific ESLyric patch script is source only and is never invoked by the public installer.

The upstream Verdant notice describes additional binaries bundled by upstream; those passages do not describe this project's public archive. The local-only development package is a separate artifact and is not uploaded to GitHub Releases.
