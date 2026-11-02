"""Exercise long press with real JS timers/SDK/GDI in the stopped disposable host."""
import json
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile'
app=PROFILE/'verdant/app.js';saved=app.read_bytes();script=PROFILE/'verdant/pointer-hold-check.js'
result_file=PROFILE/'smartshuffle/hold-drag-host-result.json';result_file.unlink(missing_ok=True)
script.write_text((ROOT/'tests/host_pointer_hold.js').read_text(encoding='utf-8-sig'),encoding='utf-8-sig')
app.write_text(saved.decode('utf-8-sig')+"\ninclude('pointer-hold-check.js');\n",encoding='utf-8-sig')
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
p=subprocess.Popen([str(ROOT/'test-player/foobar2000.exe')],startupinfo=startup)
try:
    until=time.monotonic()+25
    while not result_file.exists():
        assert time.monotonic()<until,'Hold test timed out'
        time.sleep(.05)
    result=json.loads(result_file.read_text(encoding='utf-8'));assert result['ok'],result
    (ROOT/'build/hold-drag-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS',len(result['checks']),'real hold/row-overlay/native-drop checks; key poll:',result['key_poll'])
finally:
    subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/exit'],check=True);p.wait(timeout=20)
    app.write_bytes(saved);script.unlink(missing_ok=True)
