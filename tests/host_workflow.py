"""Native SDK workflow checks through a fixture installed ONLY in test-player."""
from pathlib import Path
import json
import math
import os
import struct
import subprocess
import sys
import time
import uuid
import wave

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "test-player/profile"
sys.path.insert(0, str(ROOT / "scripts"))
from bridge import Bridge
b = Bridge(PROFILE)
checks = []
b.wait(lambda s:s.get("theme",{}).get("version")=="1.0.12" and (not os.environ.get("SS_TEST_PID") or s.get("pid")==int(os.environ["SS_TEST_PID"])),timeout=20)


def check(value, name):
    if not value:
        raise AssertionError(name)
    checks.append(name)
    print("PASS", name, flush=True)


def fixture(op, **fields):
    request = {"id": uuid.uuid4().hex, "op": op, **fields}
    temp = PROFILE / "fixture-temp.json"
    temp.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
    os.replace(temp, PROFILE / "fixture-request.json")
    end = time.monotonic() + 15
    while time.monotonic() < end:
        try:
            response = json.loads((PROFILE / "fixture-response.json").read_text(encoding="utf-8"))
            if response.get("id") == request["id"]:
                if not response.get("ok"):
                    raise RuntimeError(response)
                return response
        except (OSError, ValueError):
            pass
        time.sleep(.05)
    raise TimeoutError("fixture request timed out")


def sound(path, seconds, frequency):
    samples = [int(2000 * math.sin(2 * math.pi * frequency * i / 22050)) for i in range(int(seconds * 22050))]
    with wave.open(str(path), "wb") as f:
        f.setparams((1, 2, 22050, len(samples), "NONE", "not compressed"))
        f.writeframes(struct.pack("<" + "h" * len(samples), *samples))


media = ROOT / "build/fixture-media"
media.mkdir(exist_ok=True)
files = []
for name, hz in [("a", 220), ("b", 440), ("c", 1760)]:
    path = media / f"{name}.wav"
    sound(path, 4, hz)
    files.append("file://" + str(path))
setup = fixture("setup", files=files)
source, outside = setup["playlist"], setup["outside"]
s = b.request("play", playlist=source, item=0)
s = b.wait(lambda s: s["now_id"] == files[0] + "|0")
source_guid = s["source"]
check(s["source_name"] == "SmartShuffle acceptance", "Source switches through native playlist identity")
first_round = s["round"]
heard = [s["now_id"]]
deadline = time.monotonic() + 18
while len(heard) < 4 and time.monotonic() < deadline:
    s = b.state()
    if s["now_id"] != heard[-1]:
        heard.append(s["now_id"])
    time.sleep(.05)
check(len(heard) == 4 and len(set(heard[:3])) == 3, "Natural EOF traverses all three real short WAV tracks and starts another round")
check(heard[2] != heard[3] and s["round"] > first_round, "Natural round boundary reshuffles without adjacent repetition")
store = json.loads((PROFILE / "smartshuffle/store.json").read_text(encoding="utf-8"))
check(all(store["lifetime"].get(path + "|0", 0) >= 1 for path in files), "Short tracks record qualified lifetime and recent listens")
before = {t["id"] for t in s["remaining"]}
b.request("previous")
s = b.wait(lambda s: s["now_id"] != heard[-1])
check({t["id"] for t in s["remaining"]} == before - {s["now_id"]}, "Previous only consumes its explicit replay and never erases other pending songs")

fixture("play", playlist=source, item=0)
b.wait(lambda s: s["now_id"] == files[0] + "|0")
fixture("queue", playlist=outside, item=2)
b.request("next")
s = b.wait(lambda s: s["now_id"] == files[2] + "|0")
check(s["source"] == source_guid, "Immediate external queue followed by Next retains source ownership")

fixture("rename", playlist=source, name="SmartShuffle renamed")
s = b.wait(lambda s: s["source_name"] == "SmartShuffle renamed")
check(s["source"] == source_guid, "Playlist rename preserves persistent identity")
subprocess.run([str(ROOT / "test-player/foobar2000.exe"), "/stop"], check=True)
time.sleep(.4)
check(not fixture("status")["playing"], "Explicit Stop does not auto-restart a round")

# Different CUE subsongs share a file but must decode and cache separately.
prior_cache = json.loads((PROFILE / "smartshuffle/features.json").read_text(encoding="utf-8"))
cue_audio = media / "cue-audio.wav"
with wave.open(str(cue_audio), "wb") as f:
    a = [int(2200 * math.sin(2 * math.pi * (220 if i < 88200 else 1760) * i / 22050)) for i in range(176400)]
    f.setparams((1, 2, 22050, len(a), "NONE", "not compressed"))
    f.writeframes(struct.pack("<" + "h" * len(a), *a))
cue = media / "two-tracks.cue"
cue.write_text('PERFORMER "Fixture"\nTITLE "CUE boundaries"\nFILE "cue-audio.wav" WAVE\n  TRACK 01 AUDIO\n    TITLE "Low"\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    TITLE "High"\n    INDEX 01 00:04:00\n', encoding="utf-8")
cue_setup = fixture("cue", path="file://" + str(cue))
check(cue_setup["tracks"] == 2, "SDK discovers two CUE subsongs")
b.request("play", playlist=cue_setup["playlist"], item=0)
s = b.wait(lambda s: "two-tracks.cue" in s["now_id"])
check(s["remaining_count"] == 1, "CUE subsongs are distinct scheduling identities")
b.request("scan_pause", paused=False)
deadline = time.monotonic() + 50
while time.monotonic() < deadline:
    s = b.state()
    if s["scan"]["completed"] == 2:
        break
    time.sleep(.2)
check(s["scan"]["completed"] == 2 and s["scan"]["failed"] == 0, "Actual SDK decoder and packaged analyzer complete both CUE subsongs")
cache = json.loads((PROFILE / "smartshuffle/features.json").read_text(encoding="utf-8"))
cue_features = [v["features"] for k, v in cache.items() if "two-tracks.cue|" in k and k not in prior_cache and "features" in v]
check(len(cue_features) == 2 and cue_features[0] != cue_features[1], "CUE analysis respects boundaries and produces different cached features")
subprocess.run([str(ROOT / "test-player/foobar2000.exe"), "/stop"], check=True)

devices = b.request("outputs")["response"]["devices"]
check(any("Lian II" in d["name"] and ("独占" in d["name"] or "exclusive" in d["name"]) for d in devices), "Lian II WASAPI exclusive endpoint is available")
check(any("Lian II" in d["name"] and d["active"] for d in devices), "Existing Lian II output remains selected")
(ROOT / "build/host-workflow.json").write_text(json.dumps({"count": len(checks), "checks": checks}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"{len(checks)} real-host workflow checks passed", flush=True)
