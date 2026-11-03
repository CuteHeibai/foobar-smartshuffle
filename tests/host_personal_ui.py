"""Measure drag drawing and repaint dispatch in a disposable SDK/GDI host."""
import json
import sqlite3
import sys
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile'
with sqlite3.connect((PROFILE/'config.sqlite').resolve()) as database:
    assert database.execute("SELECT value FROM configStrings WHERE name='core.output.mode'").fetchone()[0].strip('{}').upper()=='EEEB07DE-C2C8-44C2-985C-C85856D96DA1', 'Disposable null output required'
saved_store=(PROFILE/'smartshuffle/store.json').read_bytes()
personal=PROFILE/'smartshuffle/personal.json';saved_personal=personal.read_bytes() if personal.exists() else None
# This test starts with an empty personal library, then restores its exact input.
personal.unlink(missing_ok=True)
app=PROFILE/'verdant/app.js';saved=app.read_bytes();script=PROFILE/'verdant/personal-ui-check.js'
result_file=PROFILE/'smartshuffle/personal-ui-host-result.json';result_file.unlink(missing_ok=True)
script.write_text((ROOT/'tests/host_personal_ui.js').read_text(encoding='utf-8-sig'),encoding='utf-8-sig')
app.write_text(saved.decode('utf-8-sig')+"\ninclude('personal-ui-check.js');\n",encoding='utf-8-sig')
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
p=subprocess.Popen([str(ROOT/'test-player/foobar2000.exe')],startupinfo=startup)
try:
    until=time.monotonic()+25
    while not result_file.exists():
        assert time.monotonic()<until,'Personal UI test timed out'
        time.sleep(.05)
    result=json.loads(result_file.read_text(encoding='utf-8'));assert result['ok'] and not result.get('cleanup'),result
    (ROOT/'build/personal-ui-host-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
finally:
    sys.path.insert(0,str(ROOT/'scripts'));from bridge import Bridge
    Bridge(PROFILE).request('personal_config',enabled=False)
    subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/stop'],check=True);subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/exit'],check=True);p.wait(timeout=20)
    app.write_bytes(saved);script.unlink(missing_ok=True)
    (PROFILE/'smartshuffle/store.json').write_bytes(saved_store)
    if saved_personal is None:personal.unlink(missing_ok=True)
    else:personal.write_bytes(saved_personal)
