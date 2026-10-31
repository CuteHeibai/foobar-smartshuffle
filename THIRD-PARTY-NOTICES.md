# Third-party notices

The root MIT license covers this project's original work. Third-party works retain their own copyrights and licenses.

- Chinese Verdant adaptation: [superziper/verdant-foobar2000-theme](https://github.com/superziper/verdant-foobar2000-theme), MIT. See `theme/verdant/LICENSE` and its upstream notices. No Spotify or NetEase endorsement is implied.
- Native component: foobar2000 SDK 2025-03-07 and its PFC/library support code, copyright Peter Pawlowski; notice texts are retained under `licenses/`. The SDK is fetched for builds, not checked into this repository.
- Native JSON: [nlohmann/json v3.11.3](https://github.com/nlohmann/json/tree/v3.11.3), MIT, copyright Niels Lohmann. Notice retained under `licenses/`.
- Analyzer: CPython and the distributions pinned in `analyzer/requirements.txt`, including NumPy, SciPy, librosa, soundfile/libsndfile and soxr/libsoxr. Each retains its original license. The public desktop archive includes the Python license, dependency metadata and license files collected from the exact build environment, plus notices already present in the bundled runtime. PyInstaller's license and bootloader exception are retained with its distribution metadata.
- Columns UI, JSplitter and ESLyric are user-installed dependencies. Their binaries are not included in the public release. The optional version-specific ESLyric patch script is source only and is never invoked by the public installer.

The upstream Verdant notice describes additional binaries bundled by upstream; those passages do not describe this project's public archive. The local-only development package is a separate artifact and is not uploaded to GitHub Releases.
