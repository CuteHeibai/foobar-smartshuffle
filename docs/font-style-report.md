# Offline profile typography and palette migration

Investigation and implementation: 2026-10-31. No installed profile writes, player launch/exit, GUI automation, screenshots, or native builds were performed by this work unit.

`scripts/profile_style.py` exposes `apply_profile(profile, family='Segoe UI')`. It accepts the **profile directory**, verifies an existing Windows `running` marker through an exclusive open, parses all proposed settings before writing, changes only supported record GUIDs / one SQLite key, and reports changed entry counts, changed paths and unsupported structures. The installer must back up / roll back the three paths below as a group. The helper does not close a player or create a profile backup itself.

A `running` marker can remain after the player exits. On Windows the helper calls `CreateFileW` with `GENERIC_READ`, share mode 0 and `OPEN_EXISTING`, using pointer-sized HANDLE signatures, and holds the returned handle until migration finishes. Sharing, lock, inspection and access failures reject migration; a successful exclusive open permits an offline upgrade. The marker's contents and existence are preserved, and `CloseHandle` releases the handle afterward. This does not guess player state from process names. Other platforms conservatively reject marker presence. A missing marker is not created; the installer still owns preventing a concurrent player launch.

```python
from profile_style import apply_profile
report = apply_profile(stopped_profile_directory, family='Segoe UI')
```

## Findings and supported settings

The installed Columns UI profile already stored Segoe UI in both common fonts and all eight client entries. Both common entries used **System** font mode, so the actual family remained dependent on the Windows UI font. ESLyric stored **SimSun** in its default panel configuration and its detached Default UI element configuration. This is static configuration evidence; it does not identify every font actually painted on screen.

| File / structure | Exact supported setting | Migration |
| --- | --- | --- |
| `configuration/foo_ui_columns.dll.cfg` | Font manager `6B71F91C-6B7E-4DBE-B27B-C493AA513FD0`, version 0 | Both common entries and every existing per-client override become Custom Segoe UI. Preserve sizes, weights, italics, underline/strikeout, quality, metrics, client GUIDs and point-size extensions. Set charset to DEFAULT_CHARSET. Update cached DirectWrite family names so a cache cannot retain the old face. |
| same | Editor font `D429D322-D236-7356-3325-4B67C5D4503E` | Supported 92-byte LOGFONTW / 96-byte LOGFONTW + point size. Change family and charset only. |
| same | Legacy playlist-switcher font `D61B2F01-A845-C1F5-9937-26AB7470F50F` | Supported 92-byte LOGFONTW. Change family and charset only. |
| same | Color manager `15FD4FF9-0622-4077-BFBB-DF0102B6A068`, version 0 | Both common banks and every existing light/dark client entry use Custom dark colors. Text RGB(225,225,225), background (18,18,18), selected background (60,60,60), inactive selection (40,40,40), active frame Spotify green (30,215,96). Preserve entry identities/order. |
| same | Dark mode `1278CD90-1D95-48E8-873A-01F9AD2DBC5F` | Explicit Enabled, enum value 1. |
| `configuration/foo_uie_eslyric.dll.cfg` | Default panel `3544B96E-1649-4C28-9688-CCCC479186BA` | Strict recognized panel protobuf only; change nested font field 7 / family field 5 and charset field 4. Preserve every other field byte-for-byte. |
| `config.sqlite`, `configBlobs` | `ui.elem.36A795A3-110B-4398-995A-84CEA2B13427.config` | Same strictly recognized ESLyric font migration. No other SQLite rows/tables are changed. |

Missing supported settings are left missing; this does not synthesize every possible plugin client. Unknown CUI versions/extensions and unknown ESLyric schema are retained and reported as unsupported. Broken cfg envelopes, truncated CUI structures and duplicate GUIDs fail before migration writes. An invalid/unknown ESLyric payload is preserved and reported because its public native schema is unavailable.

For the captured ESLyric 1.0.6.7 layout, the top-level protobuf contains field 1 = 4543308, field 2 = panel UUID, field 7 = font message. Its font message has fields 1 = size (60), 2 = weight (400), 3 = italic (0), 4 = charset (134), 5 = family (`SimSun`). The helper requires all five correctly typed, unique and plausible font fields. It preserves unknown fields, unknown-field order and their original encodings; it does not replace strings elsewhere. In particular, a caption containing `SimSun` remains unchanged. Font size units and unrecognized fields are not reinterpreted.

The component file envelope is 16-byte magic `D13D22B2C415F546803196E692BC1E20`, 16-byte **salted MD5 checksum**, little-endian body length, then SDK GUID + length + value records. The checksum is exactly `MD5(bytes.fromhex('63f8b12d14d12248acaf8f24bb085253') + body)`. The helper validates the incoming checksum and recomputes it after edits, together with the body/record lengths.

The initial helper incorrectly preserved this checksum as opaque metadata. Parent-controlled independent-player testing showed that the host rejected such edited files and reset the CUI layout. Restoring the exact original config restored the theme, isolating the failure. The subsequent static investigation established the salted checksum; it is not ordinary MD5 of the body alone. The minimum correction is checksum validation/recalculation; no layout, font or color serializer changes were required. **The corrected envelope still requires the parent's independent runtime acceptance.**

## Chinese and scope limits

Segoe UI is the chosen Latin UI family. Native LOGFONT records cannot store a CSS-style fallback stack. DEFAULT_CHARSET and Windows' normal renderer fallback/linking remain available; this helper does not change the machine's font registry, install fonts or force a single Chinese fallback family. Microsoft documents [Windows font fallback and font linking](https://learn.microsoft.com/en-us/globalization/fonts-layout/fonts) and the [LOGFONTW charset field](https://learn.microsoft.com/en-us/windows/win32/api/shtypes/ns-shtypes-logfontw). Actual Chinese glyph selection/appearance still needs a render check in the target environment.

The helper covers existing plugins that consume Columns UI's common/per-client font and color managers. It cannot force hardcoded fonts in unrelated components, generic Windows dialogs, context menus using system fonts, third-party renderers ignoring UI callbacks, or fonts explicitly specified inside scripts/XML layouts. Default UI's own global font persistence was not established, so no guessed core GUID is changed. The known detached ESLyric Default UI element is covered independently of that limitation.

ESLyric color overrides, custom layout XML font/color attributes, script editor styles, desktop lyric settings and unknown protobuf fields remain unchanged. Its native lyric host callback font/palette and the JS theme typography are handled separately by the parent work unit. No claim is made that those callbacks override every custom third-party setting.

## Evidence and verification

Official Columns UI source fetched read-only under ignored `build/columns_ui`, commit `f5c3adfcb8137eb8c8447203269c9fa4c2c110ca`: [font manager serialization](https://github.com/reupen/columns_ui/blob/f5c3adfcb8137eb8c8447203269c9fa4c2c110ca/foo_ui_columns/font_manager_data.cpp), [LOGFONT serializer](https://github.com/reupen/columns_ui/blob/f5c3adfcb8137eb8c8447203269c9fa4c2c110ca/foo_ui_columns/font_utils.cpp), [color manager serialization](https://github.com/reupen/columns_ui/blob/f5c3adfcb8137eb8c8447203269c9fa4c2c110ca/foo_ui_columns/colour_manager_data.cpp), [setting GUIDs](https://github.com/reupen/columns_ui/blob/f5c3adfcb8137eb8c8447203269c9fa4c2c110ca/foo_ui_columns/config_appearance.cpp). Local foobar SDK `cfg_var_legacy.cpp` independently establishes the GUID + uint32 length record format.

Checksum evidence came from read-only static analysis of installed `foobar2000.exe`, SHA-256 `6f7b10c4b3b84e1afa0b7cfbdba1277d1749fe4050a565d26112449ff1ae6e46`, preferred image base `0x140000000`. REA opened the artifact; deep providers were unavailable (Ghidra/IDA/Kuna unconfigured; Hopper unsupported on this host). PE mapping and assembly below therefore use local pefile/Capstone fallback, not REA decompilation or runtime tracing. Writer function `0x1400845D0–0x1400846B5` writes magic, 16 checksum bytes, uint32 body length and body. Its calling path invokes checksum routine `0x140083180–0x140083284`, which loads 16 salt bytes from RVA `0x34C2F0`, initializes a hash state, processes salt followed by the supplied body and returns 16 result bytes. Testing the resulting MD5 hypothesis exactly matched donor `theme/columns-ui-layout.cfg`, the 11897-byte original backup and all 11 installed component config files, including ESLyric. This hypothesis followed the checksum writer's dataflow; it was not a checksum brute-force search.

The SDK alternative is technically available: `foobar2000_client::get_config/set_config` in `vendor/foobar2000/SDK/component.h` transfers raw cfg_var GUID/length records, and the component client's implementation delegates to `cfg_var_legacy`. A native component could obtain another loaded component's `foobar2000_get_interface` export and use its existing client with the host API/module, inject exact changed records, then let a normal host save serialize the envelope. It requires a live, properly initialized host plus refresh/restart handling and has not been implemented here. The checksum correction preserves the requested offline migration instead.

Official ESLyric release source, commit `3cc247eb6ff6bb3dfdf5c5b8156bf98552448b22`, contains layouts/localizations, not its native configuration schema. Official wiki commit `c11039c6e274cdf67df888a27e3e5d2ed3172851` documents [`SetTextFont` / `SetUseCustomFont` and theme fallback](https://github.com/ESLyric/release/wiki/%E5%A4%96%E9%83%A8JS%E9%9D%A2%E6%9D%BF%E6%8E%A7%E5%88%B6%E6%8E%A5%E5%8F%A3); it is newer than installed 1.0.6.7 and does not prove every method exists in that binary. The persisted font structure above is a scoped inference from real copied configurations, not an upstream published schema or runtime trace.

`python -m unittest discover -s tests -p test_profile_style.py`: **13 passed, 1 non-Windows test skipped on Windows**. Coverage includes font metrics and unrelated records, optional DirectWrite cache, editor/legacy fonts, common/per-plugin colors, both ESLyric paths, unrelated captions/SQLite rows, idempotence, malformed/duplicate containers, future versions and invalid families. Checksum regressions verify literal salted-MD5 vectors, recomputation after font edits and rejection of a corrupt checksum before writes. Marker regressions use a real exclusive Windows file handle: migration is rejected with the handle held and succeeds after it closes; a stale marker also allows migration while preserving its original contents. The skipped case checks conservative presence handling on non-Windows.

A temporary copy of the installed profile's two config files and a read-only SQLite backup was migrated. Report: 10 CUI font entries, 26 CUI color entries, 1 dark-mode entry, 2 ESLyric font entries changed; no unsupported structures. A second pass changed nothing. Record comparison: only CUI font/color/dark GUIDs changed among 169 records; only ESLyric default panel changed among 14 records; only the known ESLyric detached-panel key changed among 59 `configBlobs` rows. Temporary copy was then removed. The installed profile was only read.

After the checksum correction, the original 11897-byte CUI backup migrated to another 11897-byte file with all 169 records and the `verdant` script path retained. Its checksum changed from `9fe010994e7fdab19de95515b0acf9fb` to correctly computed `d5618de672c4e17f4635a664be0104b9`; re-reading passed checksum validation and a second migration changed nothing. Parent runtime acceptance is tracked separately.

No runtime/UI acceptance, plugin-dialog inspection, Chinese rendered-glyph inspection or main native build is included in these results.

## Integration acceptance

The corrected migration was accepted by the actual disposable foobar host. Its Columns UI layout loaded, all six public UI font roles reported Segoe UI and dark mode was active. The native ESLyric instance restored the saved panel configuration and reported Segoe UI rather than SimSun. These are live SDK/configuration checks; rendered glyph appearance and pointer interaction remain manual checks.
