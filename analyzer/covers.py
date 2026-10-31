"""Read-only music metadata lookup; artwork and provenance live in the profile cache.

execute(root, {"task": "covers", "rows": [...]}) returns one result per input
row. Call again while ``pending`` is true to continue a bounded batch. Native
artwork should be filtered by the caller; ``has_artwork`` also skips a row.
No audio file or adjacent directory is opened or modified by this module.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import unicodedata

from analyzer.__main__ import _publish


UA = 'foobar-smartshuffle/1.0.3 (https://github.com/CuteHeibai/foobar-smartshuffle)'
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_JSON_BYTES = 1024 * 1024
NEGATIVE_TTL = 24 * 60 * 60
ERROR_TTL = 30 * 60
UUID = re.compile(r'^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$')


def _normal(text):
    # Exact identity comparison only: keep diacritics and Japanese voicing.
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())


def _tag(row, names, nested):
    value = next((row[name] for name in names if row.get(name)), '')
    if not value and isinstance(row.get('mbids'), dict):
        value = next((row['mbids'][name] for name in nested if row['mbids'].get(name)), '')
    if isinstance(value, list):
        if len(value) != 1:
            raise ValueError('An album must have one MusicBrainz identity')
        value = value[0]
    if value and (not isinstance(value, str) or not UUID.fullmatch(value.strip())):
        raise ValueError('Invalid MusicBrainz album identity')
    return value.strip().lower() if value else ''


def _row(row):
    if not isinstance(row, dict):
        raise ValueError('Cover row must be an object')
    path = row.get('path')
    subsong = row.get('subsong', 0)
    if not isinstance(path, str) or not path.strip() or len(path) > 8192 or '\x00' in path:
        raise ValueError('A track path is required')
    if isinstance(subsong, bool) or not isinstance(subsong, int) or not 0 <= subsong <= 0xffffffff:
        raise ValueError('Invalid subsong')
    identity = row.get('id', path + '|' + str(subsong))
    if not isinstance(identity, str) or not identity or len(identity) > 8400:
        raise ValueError('Invalid track identity')
    artist = row.get('album_artist') or row.get('artist', '')
    album = row.get('album', '')
    if not isinstance(artist, str) or not isinstance(album, str) or len(artist) > 1000 or len(album) > 1000:
        raise ValueError('Invalid album metadata')
    release = _tag(row, ('musicbrainz_albumid', 'musicbrainz_releaseid', 'release_mbid'), ('release', 'release_id'))
    group = _tag(row, ('musicbrainz_releasegroupid', 'release_group_mbid'), ('release-group', 'release_group', 'release_group_id'))
    if not release and not group and (not _normal(artist) or not _normal(album)) and not row.get('has_artwork'):
        raise ValueError('Artist and album, or a MusicBrainz album identity, are required')
    key = json.dumps(['release', release, group] if release else ['release-group', group] if group
                     else ['album', _normal(artist), _normal(album)], ensure_ascii=False)
    return {'id': identity, 'path': path, 'subsong': subsong, 'artist': artist.strip(), 'album': album.strip()}, {
        'key': hashlib.sha256(key.encode('utf-8')).hexdigest(), 'release': release, 'group': group,
        'artist': artist.strip(), 'album': album.strip()}


def _pace(root, marker_name, interval):
    marker = root / marker_name
    try:
        delay = interval - (time.time() - float(marker.read_text(encoding='ascii')))
    except (OSError, ValueError):
        delay = 0
    if delay > 0:
        time.sleep(min(delay, interval))
    marker.write_text(str(time.time()), encoding='ascii')


def _read_url(root, url, limit, deadline, params=None):
    import requests
    is_mb = url.startswith('https://musicbrainz.org/')
    _pace(root, 'musicbrainz-time.txt' if is_mb else 'coverart-time.txt', 1.1 if is_mb else 0.2)
    if time.monotonic() >= deadline:
        raise TimeoutError('Cover task time budget exhausted')
    response = requests.get(url, params=params, headers={'User-Agent': UA},
                            timeout=(5, 12), stream=True)
    try:
        if response.status_code == 404:
            return None, '', ''
        response.raise_for_status()
        try:
            if int(response.headers.get('Content-Length', '0')) > limit:
                raise ValueError('Cover response exceeds size limit')
        except TypeError:
            raise ValueError('Invalid cover response length') from None
        chunks = []
        size = 0
        for chunk in response.iter_content(chunk_size=65536):
            if time.monotonic() >= deadline:
                raise TimeoutError('Cover task time budget exhausted')
            size += len(chunk)
            if size > limit:
                raise ValueError('Cover response exceeds size limit')
            chunks.append(chunk)
        return b''.join(chunks), response.headers.get('Content-Type', '').split(';')[0].lower(), response.url
    finally:
        response.close()


def _find_group(root, album, deadline):
    escaped = lambda value: re.sub(r'([+\-!(){}\[\]^"~*?:\\/])', r'\\\1', value)
    query = 'releasegroup:"' + escaped(album['album']) + '" AND artist:"' + escaped(album['artist']) + '"'
    raw, _, _ = _read_url(root, 'https://musicbrainz.org/ws/2/release-group/', MAX_JSON_BYTES, deadline,
                          {'query': query, 'fmt': 'json', 'limit': 25})
    if raw is None:
        return '', 'missing'
    data = json.loads(raw)
    matches = set()
    for entry in data.get('release-groups', []):
        if not isinstance(entry, dict) or _normal(str(entry.get('title', ''))) != _normal(album['album']):
            continue
        credits = [credit for credit in entry.get('artist-credit', []) if isinstance(credit, dict)]
        artist = ''.join(str(c.get('name', c.get('artist', {}).get('name', ''))) + str(c.get('joinphrase', '')) for c in credits)
        if _normal(artist) != _normal(album['artist']):
            continue
        identity = str(entry.get('id', ''))
        if UUID.fullmatch(identity) and int(entry.get('score', 100)) >= 95:
            matches.add(identity.lower())
    if len(matches) == 1 and int(data.get('count', 0)) <= 25:
        return matches.pop(), ''
    return '', 'ambiguous' if len(matches) > 1 or int(data.get('count', 0)) > 25 else 'missing'


def _image_extension(raw, mime):
    if mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream'):
        raise ValueError('Cover response is not an image')
    if raw.startswith(b'\xff\xd8\xff'):
        return '.jpg'
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        return '.png'
    if raw.startswith((b'GIF87a', b'GIF89a')):
        return '.gif'
    if raw.startswith(b'RIFF') and raw[8:12] == b'WEBP':
        return '.webp'
    raise ValueError('Cover response has no supported image signature')


def _lookup(root, album, deadline):
    choices = []
    if album['release']:
        choices.append(('release', album['release']))
    if album['group']:
        choices.append(('release-group', album['group']))
    if not choices:
        group, status = _find_group(root, album, deadline)
        if not group:
            return {'status': status}
        choices.append(('release-group', group))
    for entity, identity in choices:
        source = 'https://coverartarchive.org/' + entity + '/' + identity + '/front-500'
        raw, mime, resolved = _read_url(root, source, MAX_IMAGE_BYTES, deadline)
        if raw is None:
            continue
        extension = _image_extension(raw, mime)
        path = root / 'album-covers' / (album['key'] + extension)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.', suffix='.tmp', delete=False) as output:
                temporary = Path(output.name)
                output.write(raw)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
            temporary = None
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        return {'status': 'downloaded', 'cover': str(path), 'source': source, 'resolved_source': resolved,
                'musicbrainz': 'https://musicbrainz.org/' + entity + '/' + identity,
                'provider': 'Cover Art Archive', 'match': 'tag' if album['release'] or album['group'] else 'exact-artist-album'}
    return {'status': 'missing'}


def _cached(entry, folder):
    if not isinstance(entry, dict):
        return None
    if entry.get('cover'):
        try:
            path = Path(entry['cover']).resolve()
            if path.parent == folder.resolve() and path.is_file() and 0 < path.stat().st_size <= MAX_IMAGE_BYTES:
                return {**entry, 'status': 'cached'}
        except (OSError, ValueError, TypeError):
            pass
        return None
    ttl = ERROR_TTL if entry.get('status') == 'error' else NEGATIVE_TTL
    if entry.get('status') in ('missing', 'ambiguous', 'error') and 0 <= time.time() - entry.get('checked_at', 0) < ttl:
        return dict(entry)
    return None


def execute(root, request):
    """Cache a bounded batch. ``force`` retries negative entries, never valid images.

    Optional max_albums (default 16, ceiling 64) and time_budget (seconds, default
    90, ceiling 300) cap new album lookups. Existing cached rows do not consume
    the budget. ``pending`` means some rows were deferred and can be resubmitted.
    ``covers.json`` contains albums and tracks maps, plus schema version 1.
    """
    if not isinstance(request, dict) or request.get('task') != 'covers' or not isinstance(request.get('rows'), list):
        raise ValueError('Expected a covers task with a rows array')
    if len(request['rows']) > 100000:
        raise ValueError('Cover batch has too many rows')
    try:
        max_albums = max(1, min(64, int(request.get('max_albums', 16))))
        budget = max(1, min(300, float(request.get('time_budget', 90))))
    except (ValueError, TypeError, OverflowError):
        raise ValueError('Invalid cover task budget') from None
    root = Path(root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    folder = root / 'album-covers'
    folder.mkdir(exist_ok=True)
    manifest_path = root / 'covers.json'
    try:
        if manifest_path.stat().st_size > 64 * 1024 * 1024:
            raise ValueError('Cover manifest too large')
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest.get('version') != 1 or not isinstance(manifest.get('albums'), dict) or not isinstance(manifest.get('tracks'), dict):
            raise ValueError('Invalid cover manifest')
    except (OSError, ValueError, AttributeError):
        manifest = {'version': 1, 'albums': {}, 'tracks': {}}
    deadline = time.monotonic() + budget
    results = []
    attempted = 0
    pending = False
    resolved_albums = {}
    for row in request['rows']:
        try:
            item, album = _row(row)
        except ValueError as error:
            results.append({'status': 'invalid', 'error': str(error)})
            continue
        if row.get('has_artwork'):
            results.append({**item, 'status': 'existing'})
            continue
        key = album['key']
        entry = resolved_albums.get(key)
        if entry is None:
            entry = _cached(manifest['albums'].get(key), folder)
            if entry and (request.get('force') or request.get('refresh_missing')) and not entry.get('cover'):
                entry = None
        if entry is None:
            if attempted >= max_albums or time.monotonic() >= deadline:
                results.append({**item, 'status': 'deferred'})
                pending = True
                continue
            attempted += 1
            try:
                entry = _lookup(root, album, deadline)
            except Exception as error:
                # Network/JSON/image errors are local to this album. Existing files
                # and unrelated cache records remain available while offline.
                entry = {'status': 'error', 'error': str(error)[:300]}
            entry.update({'checked_at': time.time(), 'artist': album['artist'], 'album': album['album']})
            manifest['albums'][key] = entry
            # Commit each completed album, so shutdown loses at most active I/O.
            _publish(manifest_path, manifest)
        resolved_albums[key] = entry
        result = {**item, **entry, 'id': item['id'], 'path': item['path'], 'subsong': item['subsong']}
        results.append(result)
        manifest['tracks'][item['id']] = result
    _publish(manifest_path, manifest)
    return {'covers': results, 'downloaded': sum(r['status'] == 'downloaded' for r in results),
            'cached': sum(r['status'] == 'cached' for r in results), 'pending': pending}
