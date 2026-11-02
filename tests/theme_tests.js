/* Observable JSplitter bridge contract tests; Node mocks only the file/timer SDK. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '../theme/verdant');
let passed = 0;
function test(name, fn) { fn(); console.log('PASS ' + name); passed++; }
function harness() {
  const writes = [], timers = new Map(); let next = 0,now=Date.now();
  const c = { console, Date:{now:()=>now}, Math, JSON, isFinite, Number,
    fb: { ProfilePath: 'P:\\', IsPlaying: false },
    UISCALE:1,
    window: { Width:1100,Height:740, SetTimeout: fn => { timers.set(++next, fn); return next; }, ClearTimeout: id => timers.delete(id), SetInterval: () => 99, ClearInterval: () => {}, Repaint: () => {}, RepaintRect:()=>{} },
    utils: { WriteTextFile: (p, t) => { writes.push(JSON.parse(t)); return true; }, ReadTextFile: () => { throw Error('not ready'); } },
    repaintAll: () => {}, applyKeyMode: () => {}, pbShuffle: true, fsMode: false,confirmDel:null,
  };
  vm.createContext(c);
  const file = path.join(root, 'data/smartshuffle.js');
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  for(const extra of ['ui/motion.js','ui/menus.js','ui/layout.js','ui/files.js'])vm.runInContext(fs.readFileSync(path.join(root,extra),'utf8'),c);
  function ack(extra = {}) {
    c.ssAcceptState(Object.assign({ version: 1, revision: 1, enabled: true, request_id: writes.at(-1)?.id || '', ui_open: 0, point: { x: 0, y: 0 }, preview: null, response: { ok: true } }, extra));
  }
  return { c, writes, ack, tick() { now+=150;const entries = [...timers]; timers.clear(); for (const [,fn] of entries) fn(); } };
}
test('bridge exposes native request API', () => { assert.equal(typeof harness().c.ssSend, 'function'); });
test('requests serialize until matching acknowledgement; queued previews coalesce', () => {
  const h = harness(); h.c.ssSend('open'); h.c.ssSend('preview', { x: .1, y: .2 }); h.c.ssSend('preview', { x: .9, y: .4 });
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].version, 1); assert.equal(h.writes[0].op, 'open');
  h.c.ssAcceptState({ version: 1, request_id: 'unrelated', ui_open: 0 }); assert.equal(h.writes.length, 1);
  h.ack(); assert.equal(h.writes.length, 2); assert.equal(h.writes[1].x, .9); assert.notEqual(h.writes[0].id, h.writes[1].id);
});
test('cancel removes queued previews and waits for outstanding acknowledgement', () => {
  const h = harness(); h.c.ssOpen(); h.c.ssSetDraft(.4, .6); h.tick(); h.c.ssCancel();
  assert.equal(h.writes.length, 1); assert.equal(h.c.ssModal, false); h.ack({ ui_open: 1 });
  assert.equal(h.c.ssModal, false); assert.equal(h.writes[1].op, 'cancel'); assert.equal(h.writes.some(r => r.op === 'apply'), false);
});
test('coordinate mapping clamps and screen top means positive style jump', () => {
  const c = harness().c, g = { x: 100, y: 100, size: 200 };
  assert.equal(c.ssMapPoint(100, 100, g).y, 1); assert.equal(c.ssMapPoint(300, 300, g).x, 1);
  assert.equal(c.ssMapPoint(-100, 900, g).x, -1); assert.equal(c.ssMapPoint(-100, 900, g).y, -1);
});
test('apply waits for final matching preview token and exact draft', () => {
  const h = harness(); h.c.ssOpen(); h.ack({ ui_open: 1, preview_pending: true, preview: { token: '', point: { x: 0, y: 0 } } });
  assert.equal(h.c.ssApply(), false);
  h.ack({ ui_open: 1, preview_pending: false, preview: { token: 'exact-8', point: { x: 0, y: 0 } } });
  assert.equal(h.c.ssApply(), true); assert.equal(h.writes.at(-1).op, 'apply'); assert.equal(h.writes.at(-1).token, 'exact-8');
  assert.equal(h.c.ssModal, true); h.ack({ ui_open: 1 }); assert.equal(h.c.ssModal, false);
});
test('draft drag immediately disables previous token; arrows use .05 and debounce', () => {
  const h = harness(); h.c.ssOpen(); h.ack({ preview: { token: 'old', point: { x: 0, y: 0 } } });
  h.c.ssKeyDown(38); assert.equal(h.c.ssDraft.y, .05); assert.equal(h.c.ssApply(), false);
  h.c.ssSetDraft(5, -3); assert.equal(h.c.ssDraft.x, 1); assert.equal(h.c.ssDraft.y, -1);
  assert.equal(h.writes.length, 1); h.tick(); assert.equal(h.writes.at(-1).op, 'preview'); assert.equal(h.writes.at(-1).x, 1);
});
test('stale preview keeps dialog open and requires fresh apply', () => {
  const h = harness(); h.c.ssOpen(); h.ack({ preview: { token: 'a', point: { x: 0, y: 0 } } }); h.c.ssApply();
  h.ack({ response: { ok: false, code: 'stale_preview', message: 'updated' }, preview: { token: 'b', point: { x: 0, y: 0 } } });
  assert.equal(h.c.ssModal, true); assert.equal(h.c.ssApply(), true); assert.equal(h.writes.at(-1).token, 'b');
});
test('native menu open counter opens once and unrelated updates preserve draft', () => {
  const h = harness(); h.ack({ ui_open: 7 }); assert.equal(h.c.ssModal, true); h.c.ssSetDraft(.8, .2);
  h.ack({ ui_open: 7 }); assert.equal(h.c.ssDraft.x, .8); h.c.ssCancel(); h.ack({ ui_open: 7 }); assert.equal(h.c.ssModal, false);
  h.ack({ ui_open: 8 }); assert.equal(h.c.ssModal, true);
});
test('playlist play delegates to native without creating or shuffling playlists', () => {
  const h = harness(); const actions = [];
  h.c.VOL_CEIL = 0; h.c.NP = null; h.c.plman = { ExecutePlaylistDefaultAction: (...args) => actions.push(args), PlaybackOrder: 0 };
  vm.runInContext(fs.readFileSync(path.join(root, 'data/playback.js'), 'utf8'), h.c);
  h.c.playPlaylistItem(3, 12); assert.equal(h.writes.at(-1).op, 'play'); assert.equal(h.writes.at(-1).playlist, 3); assert.equal(h.writes.at(-1).item, 12); assert.equal(actions.length, 0);
  h.c.pbShuffle = false; h.c.playPlaylistItem(3, 12); assert.deepEqual(actions, [[3,12]]);
});
test('output labels distinguish WASAPI shared/exclusive and preserve ASIO names', () => {
  const c = harness().c;
  const file = path.join(root, 'data/output.js');
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  assert.equal(typeof c.ssOutputLabel, 'function');
  assert.equal(c.ssOutputLabel({ name: 'Speakers (USB DAC)' }), 'WASAPI共享 · Speakers (USB DAC)');
  assert.equal(c.ssOutputLabel({ name: 'Speakers [exclusive]' }), 'WASAPI独占 · Speakers [exclusive]');
  assert.equal(c.ssOutputLabel({ name: '默认 : 耳机 (Lian II) [独占]' }), 'WASAPI独占 · 默认 : 耳机 (Lian II) [独占]');
  assert.equal(c.ssOutputLabel({ name: '默认 : 耳机 (Lian II)' }), 'WASAPI共享 · 默认 : 耳机 (Lian II)');
  assert.equal(c.ssOutputLabel({ name: 'ASIO : Voicemeeter Virtual ASIO' }), 'ASIO : Voicemeeter Virtual ASIO');
  assert.equal(c.ssOutputLabel({ name: 'Null Output' }), 'Null Output');
});
test('output device parse rejects malformed rows and never changes selected device', () => {
  const c = harness().c; let changed = 0;
  c.fb.SetOutputDevice = () => changed++;
  vm.runInContext(fs.readFileSync(path.join(root, 'data/output.js'), 'utf8'), c);
  assert.equal(c.ssParseOutputs('broken').length, 0); assert.equal(c.ssParseOutputs('{}').length, 0);
  assert.equal(c.ssParseOutputs('[{"name":"missing ids"}]').length, 0);
  const devices = c.ssParseOutputs('[{"active":true,"device_id":"dev","output_id":"out","name":"ASIO: x"}]');
  assert.equal(devices.length, 1); assert.equal(devices[0].active, true); assert.equal(changed, 0);
});
test('named ESLyric child follows lyrics tab bounds and hides for preference modal', () => {
  const c = harness().c, shows = [], moves = [];
  c.window.GetPanel = name => { assert.equal(name, 'ESLyric'); return { Show: b => shows.push(b), Move: (...a) => moves.push(a) }; };
  c.R = { queue: { x: 650, y: 50, w: 250, h: 450 } }; c.rightTab = 'lyrics';
  vm.runInContext(fs.readFileSync(path.join(root, 'views/preference.js'), 'utf8'), c);
  assert.equal(typeof c.ssSyncLyricPanel, 'function'); c.ssSyncLyricPanel();
  assert.equal(shows.at(-1), true); assert.deepEqual(moves.at(-1).slice(0, 4), [660,108,230,382]);
  c.ssModal = true; c.ssSyncLyricPanel(); assert.equal(shows.at(-1), false);
});
test('named lyrics return after resize frames that do not synchronize the child panel',()=>{
 const c=harness().c,shows=[];c.rightTab='lyrics';c.R={queue:{x:650,y:50,w:250,h:450}};
 c.window.GetPanel=()=>({Show:b=>shows.push(b),Move(){}});vm.runInContext(fs.readFileSync(path.join(root,'views/preference.js'),'utf8'),c);
 c.ssSyncLyricPanel();c.ssResizing={key:'nav'};c.ssHideLyrics();c.ssResizing=null;c.ssSyncLyricPanel();
 assert.deepEqual(shows,[true,false,true]);assert.equal(c.ssLyricShown,true);assert.equal(c.ssLyricVisible,true);
});

test('preference modal consumes background callbacks and drag movement outside grid', () => {
  const h = harness(), c = h.c;
  vm.runInContext(fs.readFileSync(path.join(root, 'views/preference.js'), 'utf8'), c);
  let app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  vm.runInContext(app.slice(0,app.lastIndexOf('\nlayout();')), c);
  c.ssModal = true; c.SS_GRID = { x: 100, y: 100, size: 200 }; c.searchQuery = 'original'; c.view = 'search';
  c.on_char(65); c.on_mouse_wheel(1); assert.equal(c.searchQuery, 'original');
  c.on_mouse_lbtn_down(120,120); c.on_mouse_move(900,-100); assert.equal(c.ssDraft.x,1); assert.equal(c.ssDraft.y,1);
  c.on_mouse_lbtn_up(900,-100); assert.equal(c.ssDragging,false);
  assert.equal(c.on_mouse_rbtn_up(0,0), true); c.on_mouse_lbtn_dblclk(0,0);
  const drop = { Effect: 1 }; c.on_drag_drop(drop,0,0); assert.equal(drop.Effect,0);
});
test('invalid atomic state read retains last good state and UTF8 requests omit BOM', () => {
  const h = harness(), c = h.c; h.ack({ revision: 12 });
  c.utils.ReadTextFile = () => '{incomplete'; c.ssPoll(); assert.equal(c.ssState.revision,12);
  let bom;
  c.utils.WriteTextFile = (p,t,writeBom) => { bom = writeBom; assert.equal(JSON.parse(t).version,1); };
  c.ssSend('state'); assert.equal(bom,false);
});
test('output picker changes only explicitly selected different native IDs', () => {
  const c = harness().c, changes = [];
  vm.runInContext(fs.readFileSync(path.join(root, 'data/output.js'), 'utf8'), c);
  c.fb.GetOutputDevices = () => JSON.stringify([{ name: 'ASIO: Current', active: true, output_id: 'o1', device_id: 'd1' },{ name: 'Speakers [exclusive]', output_id:'o2', device_id:'d2' }]);
  c.fb.SetOutputDevice = (...args) => changes.push(args);
  c.ssShowOutputs(0,0);assert.equal(changes.length,0);
  c.ssPopupChoose(c.ssPopup.levels[0].items[0]);assert.equal(changes.length,0);
  c.ssShowOutputs(0,0);c.ssPopupChoose(c.ssPopup.levels[0].items[1]);assert.deepEqual(changes,[['o2','d2']]);
});
test('local lyrics resolve artist-title in profile lyrics and retain time parsing', () => {
  const c = harness().c;
  c.NP = { Path: 'D:\\Music\\track.flac' }; c.TF = { title: { EvalWithMetadb: () => 'Song' }, artist: { EvalWithMetadb: () => 'Artist' } };
  c.utils.ReadUTF8 = p => p === 'P:\\lyrics\\Artist - Song.lrc' ? '[00:12.00]Line' : '';
  vm.runInContext(fs.readFileSync(path.join(root, 'data/lyrics.js'), 'utf8'), c);
  c.loadLyrics(); assert.equal(c.lyrics.synced,true); assert.equal(c.lyrics.lines[0].t,12); assert.equal(c.lyrics.lines[0].text,'Line');
});
test('modal geometry fits 900 by 600 at 125 and 150 percent with eight visible rows', () => {
  const c = harness().c;
  vm.runInContext(fs.readFileSync(path.join(root, 'views/preference.js'), 'utf8'), c);
  for(const scale of [1.25,1.5]) {
    c.UISCALE = scale; const m = c.ssGeometry(900,600);
    assert.ok(m.x>=0&&m.y>=0&&m.x+m.w<=900&&m.y+m.h<=600);
    assert.ok(m.grid.x>=m.rightX+m.labelW);
    assert.ok(m.grid.y+m.grid.size+26<m.y+m.h-118);
    assert.ok(Math.floor((m.areaH-30)/8)>=30);
  }
});
test('startup sends one theme readiness handshake with native panel window', () => {
  const h = harness(); h.c.window.ID = 12345; h.c.ssStart(); h.c.ssStart();
  assert.equal(h.writes.length,1); assert.equal(h.writes[0].op,'state');
  assert.equal(h.writes[0].theme_version,'1.0.12'); assert.equal(h.writes[0].theme_window,12345);
});
test('missing named child requests native ESLyric host and waits for actual ready visibility', () => {
  const h = harness(), c = h.c; c.window.ID = 9876; c.R = { queue: { x:650,y:50,w:250,h:450 } }; c.rightTab='lyrics';
  vm.runInContext(fs.readFileSync(path.join(root,'views/preference.js'),'utf8'),c);
  c.ssSyncLyricPanel(); assert.equal(h.writes.length,1); assert.equal(h.writes[0].op,'lyrics_panel');
  assert.equal(h.writes[0].parent,9876); assert.equal(h.writes[0].visible,true);
  assert.deepEqual([h.writes[0].x,h.writes[0].y,h.writes[0].w,h.writes[0].h],[660,108,230,382]);
  assert.equal(c.ssLyricVisible,false); c.ssSyncLyricPanel(); assert.equal(h.writes.length,1);
  h.ack({ lyrics_panel:{ready:true,visible:true,error:''} }); c.ssSyncLyricPanel(); assert.equal(c.ssLyricVisible,true); assert.equal(h.writes.length,1);
  c.ssModal=true; c.ssSyncLyricPanel(); assert.equal(h.writes.at(-1).visible,false); assert.equal(c.ssLyricVisible,false);
});
test('native lyrics rect/show updates coalesce while a previous operation awaits ack', () => {
  const h = harness(), c = h.c; c.window.ID=55; c.R={queue:{x:1,y:2,w:300,h:400}}; c.rightTab='lyrics';
  vm.runInContext(fs.readFileSync(path.join(root,'views/preference.js'),'utf8'),c);
  c.ssSend('state'); c.ssSyncLyricPanel(); c.ssModal=true; c.ssSyncLyricPanel();
  assert.equal(h.writes.length,1); h.ack(); assert.equal(h.writes.length,2);
  assert.equal(h.writes[1].op,'lyrics_panel'); assert.equal(h.writes[1].visible,false);
});
console.log(`${passed} theme contract tests passed`);
