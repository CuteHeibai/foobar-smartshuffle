"""Local v1 bridge client; serializes requests and waits for the native acknowledgement."""
import argparse
import json
import os
from pathlib import Path
import time
import uuid


class Bridge:
    def __init__(self, profile):
        self.root = Path(profile) / "smartshuffle"

    def state(self):
        return json.loads((self.root / "state.json").read_text(encoding="utf-8-sig"))

    def wait(self, predicate, timeout=15):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            try:
                state = self.state()
                if predicate(state):
                    return state
            except (OSError, ValueError):
                pass
            time.sleep(.05)
        raise TimeoutError("native bridge condition timed out")

    def request(self, op, **fields):
        request = {"version": 1, "id": uuid.uuid4().hex, "op": op, **fields}
        temporary = self.root / "client-request.tmp"
        temporary.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, self.root / "request.json")
        return self.wait(lambda s: s.get("request_id") == request["id"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("op")
    parser.add_argument("--fields", default="{}")
    args = parser.parse_args()
    print(json.dumps(Bridge(args.profile).request(args.op, **json.loads(args.fields)), ensure_ascii=False, indent=2))
