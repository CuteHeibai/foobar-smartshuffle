"""Independent CLI readers must not overwrite the theme channel or each other's replies."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from bridge import Bridge
profile = ROOT / 'test-player/profile'


def request(op):
    return op, Bridge(profile).request(op)


with ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(request, ['appearance', 'outputs', 'state', 'appearance', 'state', 'outputs', 'appearance', 'outputs']))
for op, state in results:
    assert state['response']['ok']
    if op == 'appearance':
        assert state['response']['dark_mode'] and 'fonts' in state['response']
    if op == 'outputs':
        assert any('Lian II' in d['name'] for d in state['response']['devices'])
assert len({state['request_id'] for _, state in results}) == len(results)
print('PASS Concurrent clients receive unique responses for their exact command', flush=True)
public = Bridge(profile).state()
assert public['request_id'] not in {state['request_id'] for _, state in results}
print('PASS Client responses do not replace the theme acknowledgement channel', flush=True)
assert not list((profile / 'smartshuffle/commands').glob('*.json'))
assert not list((profile / 'smartshuffle/replies').glob('*.json'))
print('PASS Completed client requests and replies are removed', flush=True)
(ROOT / 'build/client-acceptance.json').write_text(json.dumps({'count': 3, 'requests': len(results)}, indent=2), encoding='utf-8')
