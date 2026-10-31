"""Real decoder failure checks, restricted to the disposable SDK fixture host."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "test-player/profile"
sys.path.insert(0, str(ROOT / "scripts"))
from bridge import Bridge

b = Bridge(PROFILE)
b.wait(lambda s: s.get("theme", {}).get("version") == "1.0.0" and
       (not os.environ.get("SS_TEST_PID") or s.get("pid") == int(os.environ["SS_TEST_PID"])))


def fixture(op, **fields):
    request = {"id": uuid.uuid4().hex, "op": op, **fields}
    temporary = PROFILE / "fixture-temp.json"
    temporary.write_text(json.dumps(request), encoding="utf-8")
    os.replace(temporary, PROFILE / "fixture-request.json")
    until = time.monotonic() + 15
    while time.monotonic() < until:
        result = json.loads((PROFILE / "fixture-response.json").read_text(encoding="utf-8"))
        if result.get("id") == request["id"]:
            if not result.get("ok"):
                raise RuntimeError(result)
            return result
        time.sleep(.05)
    raise TimeoutError(op)


subprocess.run([str(ROOT / "test-player/foobar2000.exe"), "/stop"], check=True)
bad = []
for _ in range(2):
    path = ROOT / "build/fixture-media" / ("invalid-" + uuid.uuid4().hex + ".wav")
    path.write_bytes(b"This is not an audio stream.")
    bad.append("file://" + str(path))
good = "file://" + str(ROOT / "build/fixture-media/a.wav")
setup = fixture("setup", files=[*bad, good], name="Failed prefix " + uuid.uuid4().hex)
b.request("play", playlist=setup["playlist"], item=0)
s = b.wait(lambda s: s["now_id"] == good + "|0")
assert fixture("status")["playing"], "a valid track after invalid candidates must play"
assert s["round"] == 1, "invalid candidates cannot create extra rounds"
print("PASS Invalid candidates are skipped and a later valid song plays in the same round", flush=True)
subprocess.run([str(ROOT / "test-player/foobar2000.exe"), "/stop"], check=True)

setup = fixture("setup", files=bad, name="All failed " + uuid.uuid4().hex)
b.request("play", playlist=setup["playlist"], item=0)
s = b.wait(lambda s: s["remaining_count"] == 0, timeout=12)
until = time.monotonic() + 8
while fixture("status")["playing"] and time.monotonic() < until:
    time.sleep(.1)
assert not fixture("status")["playing"], "an entirely failed round must stop"
time.sleep(1)
assert b.state()["round"] == s["round"] and not fixture("status")["playing"]
print("PASS An entirely invalid round stops without starting a retry loop", flush=True)
(ROOT / "build/host-failures.json").write_text(json.dumps({"count": 2, "checks": [
    "Invalid candidates skipped to valid song", "All failed round stopped without retry loop"
]}, indent=2), encoding="utf-8")
