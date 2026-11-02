"""Run actual JSplitter drawing into private test bitmaps, never the desktop."""
import json,subprocess,time,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];profile=ROOT/'test-player/profile';folder=profile/'smartshuffle'
app=profile/'verdant/app.js';original=app.read_bytes();script=profile/'verdant/ui-render-host-check.js';result_file=folder/'ui-render-test-result.json'
script.write_text((ROOT/'tests/host_ui_render.js').read_text(encoding='utf-8-sig'),encoding='utf-8-sig');result_file.unlink(missing_ok=True)
app.write_text(original.decode('utf-8-sig')+"\ninclude('ui-render-host-check.js');\n",encoding='utf-8-sig')
try:
    startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
    process=subprocess.Popen([str(ROOT/'test-player/foobar2000.exe')],startupinfo=startup)
    until=time.monotonic()+25
    while time.monotonic()<until:
        if result_file.exists():break
        time.sleep(.05)
    result=json.loads(result_file.read_text(encoding='utf-8'));assert result['ok'],result
    sys.path.insert(0,str(ROOT/'scripts'))
    from bridge import Bridge
    bridge=Bridge(profile);state=bridge.wait(lambda s:s.get('pid')==process.pid and s.get('theme',{}).get('version')=='1.0.14')
    context=result['context'];guid=next(p['guid'] for p in state['playlists'] if p['index']==context['playlist'])
    reply=bridge.request('menu_open',kind='context',playlist_guid=guid,items=context['items'],tracks=context['tracks'])
    assert reply['response']['ok'] and reply['response']['menu']['selected_count']==2,reply['response']
    bridge.request('menu_cancel');result['checks'].append('Native menu accepts two actual JSplitter RawPath identities and playlist indices')
    (ROOT/'build/ui-render-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS',len(result['checks']),'actual JSplitter font/viewport/opacity checks')
finally:
    subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/exit'],check=True)
    subprocess.run(['powershell','-NoProfile','-Command',f'$p=Get-Process -Id {process.pid} -ErrorAction SilentlyContinue; if($p){{$p | Wait-Process -Timeout 20}}; exit 0'],check=True)
    app.write_bytes(original);script.unlink(missing_ok=True)
