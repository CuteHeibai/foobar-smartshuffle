"""Normal process restart must retain source, point and complete pending order."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from bridge import Bridge

exe = ROOT / "test-player/foobar2000.exe"
b = Bridge(ROOT / "test-player/profile")
subprocess.run([str(exe), "/stop"], check=True)
before = b.request("state")
old_pid = before["pid"]
subprocess.run([str(exe), "/exit"], check=True)
# Wait for the real host process rather than assuming /exit is synchronous.
subprocess.run(["powershell", "-NoProfile", "-Command",
                f"$p=Get-Process -Id {old_pid} -ErrorAction SilentlyContinue; if($p){{$p | Wait-Process -Timeout 20 -ErrorAction Stop}}; exit 0"], check=True)
startup = subprocess.STARTUPINFO()
startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
startup.wShowWindow = 0
process = subprocess.Popen([str(exe)], startupinfo=startup)
after = b.wait(lambda s: s.get("pid") == process.pid and
               s.get("theme", {}).get("version") == "1.0.0", timeout=25)
for key in ("source", "round", "point"):
    assert before[key] == after[key], key
assert [t["id"] for t in before["remaining"]] == [t["id"] for t in after["remaining"]]
report = {"count": 4, "checks": ["Playlist source restored", "Round restored",
          "Two-dimensional point restored", "Complete pending order restored"], "pid": process.pid}
(ROOT / "build/restart-acceptance.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("PASS Normal restart preserves source, round, preference and exact remaining sequence", flush=True)
