"""Render with JSplitter's real bitmap API in the disposable host. No desktop input."""
import argparse,json,struct,zlib,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];profile=ROOT/'test-player/profile';folder=profile/'smartshuffle'
parser=argparse.ArgumentParser();parser.add_argument('--local-cache',action='store_true');args=parser.parse_args()
# A real RGB PNG fixture, generated without an image-library dependency.
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
raw=b''.join(b'\x00'+b'\xff\x22\x44'*32+b'\x22\x44\xff'*32 for _ in range(64))
fixture=folder/'fixture-portrait.png';fixture.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',64,64,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
rows=[{'portrait':str(fixture)}]
if args.local_cache:
 cache=json.loads(Path('C:/Program Files/foobar2000/profile/smartshuffle/artists.json').read_text(encoding='utf-8'))
 rows.extend({'portrait':a['portrait']} for a in cache.values() if a.get('portrait') and Path(a['portrait']).is_file())
input_file=folder/'portrait-test-input.json';result_file=folder/'portrait-test-result.json';input_file.write_text(json.dumps(rows),encoding='utf-8');result_file.unlink(missing_ok=True)
app=profile/'verdant/app.js';original=app.read_bytes();script=profile/'verdant/portrait-host-check.js';script.write_bytes((ROOT/'tests/host_portrait_render.js').read_bytes())
app.write_text(original.decode('utf-8-sig')+"\ninclude('portrait-host-check.js');\n",encoding='utf-8-sig')
try:
 startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
 process=subprocess.Popen([str(ROOT/'test-player/foobar2000.exe')],startupinfo=startup)
 deadline=time.monotonic()+25
 while time.monotonic()<deadline:
  if result_file.exists():break
  time.sleep(.05)
 result=json.loads(result_file.read_text(encoding='utf-8'));assert result['ok'],result;assert len(result['images'])==len(rows),result
 (ROOT/'build/portrait-render-acceptance.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print('PASS Real JSplitter renderer loads and draws',len(rows),'portraits; unverified artist entries are excluded')
 print('Actual GdiBitmap has Dispose:',result['dispose_supported'])
finally:
 subprocess.run([str(ROOT/'test-player/foobar2000.exe'),'/exit'],check=True)
 subprocess.run(['powershell','-NoProfile','-Command',f'$p=Get-Process -Id {process.pid} -ErrorAction SilentlyContinue; if($p){{$p | Wait-Process -Timeout 20}}; exit 0'],check=True)
 app.write_bytes(original);script.unlink(missing_ok=True);input_file.unlink(missing_ok=True);fixture.unlink(missing_ok=True)
