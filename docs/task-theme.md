# Task: Chinese Verdant theme + 2D preference panel

Implement theme only under `theme/verdant/`, `tests/theme_tests.js`, report `docs/task-theme-report.md`. Start from vendor/verdant-foobar2000-theme-master/theme/verdant copied to theme/verdant; preserve MIT LICENSE/attribution. No edits native/core/scanner/analyzer/install scripts. No subagents or commits. Interface locked and actual component already loads in foobar2.25.8 x64. Parent handles deployment+GUI. Use frontend-design skill, deliberate Spotify black-gray-green (user requested), Chinese Segoe UI/Microsoft YaHei UI font capable CJK, compact desktop interface, don't add unrelated features. Actual GDI JSplitter environment; no browser DOM.

Native bridge root `fb.ProfilePath + 'smartshuffle\\'`. Write UTF8 JSON request `request.json` (utils.WriteTextFile). Native timer polls every200ms; state atomic JSON `state.json`. Requests MUST {version:1,id:unique string,op:...}. Serialize/coalesce outbound requests: do not overwrite unacknowledged request unless replacing obsolete preview safely; queued subsequent user apply/cancel must await prior ack. Poll every150-250ms while panel visible/playing, parse errors retain last good state. No network server. State contract:
```
{version:1,component:'1.0.0',revision:number,request_id:string,enabled:bool,source:GUID,source_name:string,now_id:string,point:{x,y},round:number,remaining_count:number,remaining:[{id,title,artist,duration,analyzed}],queue:[same],ui_open:number,error:string,response:{ok:bool,code?,message?},preview_pending:bool,preview:null|{token,revision,point:{x,y},tracks:[first8],total:number},scan:{paused,completed,failed,total,pending,revision},managed_playlist:'__smartshuffle__'}
```
Native only writes state on changes or2s heartbeat. `remaining` is full actual committed next sequence (not hypothetical shuffle). `queue` manual priority queue. `ui_open` increases on native menu open and op open; theme should open preference modal if increases, but avoid reopening when confirming closing. `preview_pending` means computation offthread; disable Apply until preview.token is nonempty and returned point matches draft. Pending preview point displayed may have empty token.

Ops:
- `open`: fresh same-gesture random seed+initial preview; modal only open once, not again every poll
- `preview`,x,y: x[-1,1] left少听/right常听; y[-1,1] positiveUP跳跃/negativeDOWN相似; same gesture seed
- `apply`,token: commits exact full preview if revision/source still current; stale_preview returns updated preview then user applies again
- `cancel`: discard preview unchanged actual queue
- `play`,playlist:index,item:index: choose source and song; native schedules; DO NOT duplicate JS shuffle
- `play_id`,track_id: play item of current source (for upcoming list clicking)
- `preset`,x,y: apply preset asynchronously for native menu only (theme can set draft preview)
- `restart`: new round
- `enable`,enabled:bool
- `next`, `previous`: native playback control
- `scan_pause`,paused:bool; `scan_retry` clears failed cache entries
- `state`: refresh

Modify theme data/playback.js to eliminate original `__verdant_shuffle__` engine, including app.js callback reshuffleTail uses, all helpers call native. Keep sequential playback mode when intelligent disabled, preserve repeat-one explicit exception. `toggleShuffle` may toggle intelligent mode; add separate visible text/button entry '随机偏好' near bottom bar. Playing source stays user's visible playlist; internal `__smartshuffle__` filtered from nav/library. Existing library-route __verdant_np__ can remain for search/artist arbitrary handle sets but native source should get this named playlist rather than automatically exclude; internal only smartshuffle.

2D desktop modal: title + descriptive preference label, first8 native preview rows above or alongside square coordinate grid with labels top风格跳跃,bottom风格相似,left极少听,right最常听. Draggable green ball, continuous coordinates,150ms debounce, mouse capture semantics (app on_mouse_move while drag) and arrow keys step .05 (y up positive), Escape cancel Enter apply only when ready. Buttons 均衡0,0 / 常听优先 .75,0 / 少听探索 -.75,0 / 回到中心; cancel/apply. Shade background and block all background click/scroll/char while open. Responsive layout for minimum usable900x600, at125%/150% CJK no clipping; derive modal dimensions from W/H with compact alternative. Colors from theme palette, green focus rings. Show actual remaining count and round outside modal; scan progress paused/continue and retry failed action. Preview errors actionable no silent success.

Translate primary nav/home/list/search/queue/bar/empty/error/menu surfaces into natural Chinese. Disable Discord default (DRP_ON false) and optional component needn't bundle. NO automatic ReplayGain scan/tag writes; retain button user action if existing. Preserve volume/output.

Lyrics: user has ESLyric1.0.6.7 (plugin candidate WARP fix separate). Need theme queue/lyrics support: installed ESLyric embedded split panel can be invoked via menu/panel overlay, OR read current resolved local .lrc from profile lyrics (existing theme only next-to-audio). Parent can arrange ESLyric second CUI panel if needed; report clear integration interface. Prefer preserve existing theme timed lyrics and expand lookup into fb.ProfilePath+'lyrics\\' with artist-title/title matching, while keep independent existing ESLyric menu/desktop lyrics available. Do not claim native ESLyric embedding if not implemented; discuss blocker with parent early.

TDD: use Node vm harness with mocked SDK only to assert observable request protocol coalescing/ack/apply pending, coordinate mapping/clamping, cancelled draft does not apply, native request play avoids JS shuffle. Use syntax checks all .js. Main UI runtime acceptance parent actual foobar, do not fabricate screenshots. Report files and exact tested behavior.
