"""Local v1 bridge client with isolated request/reply files alongside the theme channel."""
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
        commands = self.root / 'commands'
        commands.mkdir(exist_ok=True)
        pending = commands / (request['id'] + '.json')
        reply = self.root / 'replies' / (request['id'] + '.json')
        temporary = pending.with_suffix('.tmp')
        temporary.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, pending)
        until = time.monotonic() + 15
        while time.monotonic() < until:
            try:
                result = json.loads(reply.read_text(encoding='utf-8-sig'))
                if result.get('request_id') == request['id']:
                    reply.unlink(missing_ok=True)
                    return result
            except (OSError, ValueError):
                pass
            time.sleep(.03)
        pending.unlink(missing_ok=True)
        raise TimeoutError('native bridge command timed out: ' + op)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("op")
    parser.add_argument("--fields", default="{}")
    args = parser.parse_args()
    print(json.dumps(Bridge(args.profile).request(args.op, **json.loads(args.fields)), ensure_ascii=False, indent=2))
