"""Acceptance against a RUNNING disposable player. Never targets the live installation."""
import json
import subprocess
from pathlib import Path
import sys
import time

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
from bridge import Bridge

b = Bridge(REPO / "test-player" / "profile")
report = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    report.append(label)
    print("PASS", label, flush=True)


s = b.request("state")
check(s["version"] == 1 and s["component"] == "1.0.13", "Native component and v1 bridge loaded")
check(s["remaining_count"] > 2, "Existing real playlist was read")
before = s["remaining"]
before_ids = [t["id"] for t in before]
s = b.request("open")
s = b.wait(lambda s: not s.get("preview_pending") and bool(s.get("preview", {}).get("token")))
check([t["id"] for t in s["remaining"]] == before_ids, "Opening preference does not change committed order")
token = s["preview"]["token"]
s = b.request("preview", x=.85, y=-.75)
s = b.wait(lambda s: not s.get("preview_pending") and s.get("preview") and s["preview"]["point"] == {"x": .85, "y": -.75} and bool(s["preview"]["token"]))
check([t["id"] for t in s["remaining"]] == before_ids, "Dragging both axes changes preview only")
check(len(s["preview"]["tracks"]) == 8 and s["preview"]["total"] == len(before), "Eight preview rows represent a complete remaining permutation")
s = b.request("cancel")
check(s["preview"] is None and [t["id"] for t in s["remaining"]] == before_ids, "Cancel preserves the real playback order")
s = b.request("open")
s = b.wait(lambda s: not s.get("preview_pending") and s.get("preview") and bool(s["preview"]["token"]))
preview_ids = [t["id"] for t in s["preview"]["tracks"]]
s = b.request("apply", token=s["preview"]["token"])
check(s["response"]["ok"] and [t["id"] for t in s["remaining"][:8]] == preview_ids, "Apply commits exactly the previewed first eight")
check(set(t["id"] for t in s["remaining"]) == set(t["id"] for t in before), "Preference apply preserves every eligible song exactly once")

first = s["remaining"][0]["id"]
b.request("play_id", track_id=first)
s = b.wait(lambda s: s["now_id"] == first)
check(first not in [t["id"] for t in s["remaining"]], "Real playback start consumes selected song once")
heard = [first]
expected = [t["id"] for t in s["remaining"]]
for target in expected:
    subprocess.run([str(REPO / 'test-player/foobar2000.exe'), '/next'], check=True)
    s = b.wait(lambda s: s["now_id"] == target, timeout=10)
    heard.append(s["now_id"])
check(len(heard) == len(before) and len(set(heard)) == len(heard), "Real native Next traverses a complete unique round")
check(s["round"] >= 2, "Next round prepared automatically")
last = heard[-1]
next_id = s["remaining"][0]["id"]
check(last != next_id, "Round boundary does not repeat its final track")
subprocess.run([str(REPO / 'test-player/foobar2000.exe'), '/next'], check=True)
s = b.wait(lambda s: s["now_id"] == next_id)
check(s["now_id"] == next_id, "Playback continues into the next round")

s = b.request("open")
s = b.wait(lambda s: not s.get("preview_pending") and s.get("preview") and bool(s["preview"]["token"]))
old_token = s["preview"]["token"]
next_id = s["remaining"][0]["id"]
subprocess.run([str(REPO / 'test-player/foobar2000.exe'), '/next'], check=True)
b.wait(lambda s: s["now_id"] == next_id)
s = b.request("apply", token=old_token)
check(not s["response"]["ok"], "A preview from before a playback change cannot overwrite the current round")

s = b.request("scan_pause", paused=True)
check(s["scan"]["paused"], "Analysis can be paused independently of playback")
s = b.request("scan_pause", paused=False)
check(not s["scan"]["paused"], "Analysis can be resumed")

(REPO / "build" / "native-acceptance.json").write_text(json.dumps({"checks": report, "count": len(report)}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"{len(report)} real-host acceptance checks passed")
