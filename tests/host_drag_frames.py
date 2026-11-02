"""Measure drag drawing and repaint dispatch in a disposable SDK/GDI host."""
import json
from pathlib import Path
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1];PROFILE=ROOT/'test-player/profile'
app=PROFILE/'verdant/app.js';saved=app.read_bytes();script=PROFILE/'verdant/drag-frames-check.js'
result_file=PROFILE/'smartshuffle/drag-frames-host-result.json';result_file.unlink(missing_ok=True)
script.write_text((ROOT/'tests/host_drag_frames.js').read_text(encoding='utf-8-sig'),encoding='utf-8-sig')
app.write_text(saved.decode('utf-8-sig')+"\ninclude('drag-frames-check.js');\n",encoding='utf-8-sig')
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
p=subprocess.Popen([str(ROOT/'test-player/foobar2000.exe')],startupinfo=startup)
try:
    until=time.monotonic()+25
    while not result_file.exists():
        assert time.monotonic()<until,'Drag frame test timed out'
        time.sleep(.05)
    result=json.loads(result_file.read_text(encoding='utf-8'));assert result['ok'] and not result.get('cleanup'),result
    (ROOT/'build/drag-frames-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
finally:
    subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/exit'],check=True);p.wait(timeout=20)
    app.write_bytes(saved);script.unlink(missing_ok=True)
