"""Offline, reversible appearance switch; playback and SmartShuffle data stay live.

Only explicitly listed appearance paths and SQLite rows are exchanged. No player
process is launched here. The PowerShell wrapper owns the exit/restart lifecycle.
"""
import argparse
import base64
from contextlib import closing, contextmanager
import json
import os
from pathlib import Path, PureWindowsPath
import shutil
import sqlite3
import stat
import uuid

import profile_style

APPEARANCE_PATHS = (
    'configuration/foo_ui_std.dll.cfg',
    'configuration/foo_ui_columns.dll.cfg',
    'configuration/foo_uie_eslyric.dll.cfg',
    'configuration/foo_uie_jsplitter.dll.cfg',
    'configuration/foo_ui_wizard.dll.cfg',
    'user-components-x64/foo_ui_columns',
    'user-components-x64/foo_ui_wizard',
    'user-components-x64/foo_uie_eslyric/foo_uie_eslyric.dll',
    'theme.fth',
    'verdant',
)
TABLES = ('configBlobs', 'configStrings', 'configInts', 'configReals')
UI_KEYS = frozenset((
    'cfg_var.094A28DA-C6E8-4392-BAF1-AD0F29E5B303',  # selected UI
    'cfg_var.AD13B1D4-A6F7-425E-A93B-2A3C7DC37A93',  # UI module inventory
    'smartshuffle.lyrics.panel.config',
    'ui.darkMode',
))
UI_PREFIXES = ('ui.elem.', 'ui.fonts.', 'ui.colors.', 'ui.colours.', 'ui.darkMode.')


def _appearance_key(key):
    return isinstance(key, str) and (key in UI_KEYS or key.startswith(UI_PREFIXES))


def _no_links(path):
    """Reject symlinks, junctions, reparse points and non-file tree entries."""
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
        raise ValueError('Unsafe link or reparse point: ' + str(path))
    if not stat.S_ISREG(info.st_mode) and not stat.S_ISDIR(info.st_mode):
        raise ValueError('Unsupported filesystem entry: ' + str(path))


def _child(root, relative):
    if not isinstance(relative, str) or not relative or '\\' in relative:
        raise ValueError('Unsafe relative path')
    rel = Path(relative)
    if rel.is_absolute() or PureWindowsPath(relative).drive or any(p in ('..', '.') for p in relative.split('/')) or ':' in relative:
        raise ValueError('Unsafe relative path: ' + relative)
    root = Path(root).absolute()
    _no_links(root)
    path = root
    for part in rel.parts:
        path = path / part
        _no_links(path)
    if not path.resolve().is_relative_to(root.resolve()) or path == root:
        raise ValueError('Path escapes its owner')
    return path


def _tree(path):
    _no_links(path)
    if path.is_dir():
        for item in path.iterdir():
            _tree(item)


def _remove(path):
    _tree(path)
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


def _copy(source, target):
    _tree(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)


def _json(path, value):
    _no_links(path)
    temporary = path.with_name(path.name + '.tmp')
    _no_links(temporary)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _layout(target):
    target = Path(target).absolute()
    # Inspect ancestors before resolving so junctions cannot redirect the owner.
    for path in reversed((target, *target.parents)):
        _no_links(path)
    target = target.resolve()
    if not _child(target, 'foobar2000.exe').is_file() or not _child(target, 'portable_mode_enabled').is_file():
        raise ValueError('Expected an existing portable foobar2000 target')
    profile = _child(target, 'profile')
    if not profile.is_dir():
        raise ValueError('Missing portable profile')
    _child(profile, 'running')
    _child(profile, 'config.sqlite')
    data = _child(profile, 'smartshuffle/integration')
    flag = _child(profile, 'smartshuffle/integration-mode.json')
    return target, profile, data, flag


@contextmanager
def _locked(profile):
    with profile_style._offline_profile(profile):
        lock = _child(profile, 'smartshuffle/integration-switch.lock')
        lock.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as exc:
            raise ValueError('Another integration switch is active; inspect the retained lock before retrying') from exc
        try:
            os.close(fd)
            yield
        finally:
            lock.unlink(missing_ok=True)


def _rows(database):
    if not database.is_file():
        raise ValueError('Appearance database is missing')
    result = {}
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=5)) as connection:
        for table in TABLES:
            result[table] = [
                [name, {'blob': base64.b64encode(value).decode('ascii')} if isinstance(value, bytes) else value]
                for name, value in connection.execute(f'SELECT name,value FROM {table}')
                if _appearance_key(name)
            ]
    return result


def _load_branch(branch):
    manifest = _child(branch, 'manifest.json')
    value = json.loads(manifest.read_text(encoding='utf-8'))
    if value.get('version') != 1 or set(value.get('files', {})) != set(APPEARANCE_PATHS) or set(value.get('rows', {})) != set(TABLES):
        raise ValueError('Invalid appearance branch manifest')
    files_root = _child(branch, 'files')
    for relative, exists in value['files'].items():
        if type(exists) is not bool:
            raise ValueError('Invalid appearance existence flag')
        path = _child(files_root, relative)
        _tree(path)
        if path.exists() != exists:
            raise ValueError('Incomplete appearance branch: ' + relative)
    decoded = {}
    for table, entries in value['rows'].items():
        decoded[table] = []
        seen = set()
        for entry in entries:
            if not isinstance(entry, list) or len(entry) != 2:
                raise ValueError('Invalid database appearance record')
            name, item = entry
            if not _appearance_key(name) or name in seen:
                raise ValueError('Non-appearance or duplicate database record')
            seen.add(name)
            if isinstance(item, dict) and set(item) == {'blob'}:
                item = base64.b64decode(item['blob'], validate=True)
            elif item is not None and type(item) not in (str, int, float):
                raise ValueError('Invalid appearance record type')
            decoded[table].append((name, item))
    return value['files'], decoded


def _snapshot(profile, branch):
    """Publish a complete branch atomically; retain previous branch on failure."""
    _no_links(branch)
    stage = _child(branch.parent, '.stage-' + uuid.uuid4().hex)
    previous = _child(branch.parent, '.previous-' + uuid.uuid4().hex)
    stage.mkdir(parents=True)
    try:
        files = {}
        for relative in APPEARANCE_PATHS:
            source = _child(profile, relative)
            _tree(source)
            files[relative] = source.exists()
            if source.exists():
                _copy(source, _child(stage, 'files/' + relative))
        _json(stage / 'manifest.json', {'version': 1, 'files': files, 'rows': _rows(_child(profile, 'config.sqlite'))})
        _load_branch(stage)
        if branch.exists():
            branch.replace(previous)
        try:
            stage.replace(branch)
        except Exception:
            if previous.exists():
                previous.replace(branch)
            raise
        _remove(previous)
    finally:
        _remove(stage)


def _baseline(target, backup):
    backups = _child(target, 'smartshuffle-backups')
    if backup is None:
        candidates = sorted(backups.iterdir()) if backups.is_dir() else []
        for candidate in candidates:
            try:
                return _baseline(target, candidate)
            except (ValueError, OSError, KeyError, json.JSONDecodeError, sqlite3.Error):
                continue
        raise ValueError('No verified pre-SmartShuffle original backup was found')
    backup = Path(backup).absolute()
    try:
        relative = backup.relative_to(backups)
    except ValueError as exc:
        raise ValueError('Original backup must be under this target smartshuffle-backups') from exc
    backup = _child(backups, relative.as_posix())
    value = json.loads(_child(backup, 'manifest.json').read_text(encoding='utf-8'))
    if value.get('version') != 1 or Path(value.get('target', '')).resolve() != target:
        raise ValueError('Original backup belongs to another target')
    entries = value.get('entries', [])
    absent = False
    for entry in entries:
        _child(target, entry['path'])
        if entry['path'] in ('profile/user-components-x64/foo_smartshuffle', 'profile/user-components-x64/foo_smartshuffle/foo_smartshuffle.dll') and entry.get('existed') is False:
            absent = True
    snapshot = _child(backup, 'profile-snapshot')
    if not absent or _child(snapshot, 'user-components-x64/foo_smartshuffle/foo_smartshuffle.dll').exists():
        raise ValueError('Backup is not a verified pre-SmartShuffle baseline')
    _rows(_child(snapshot, 'config.sqlite'))
    return backup, snapshot


def _prepare(target, profile, data, flag, original_backup):
    metadata = _child(data, 'baseline.json')
    if metadata.exists():
        info = json.loads(metadata.read_text(encoding='utf-8'))
        if info.get('version') != 1 or info.get('target') != str(target):
            raise ValueError('Invalid original appearance baseline ownership')
        _load_branch(_child(data, 'original'))
        return
    # Never replace an existing original branch with an upgrade backup.
    if _child(data, 'original').exists():
        raise ValueError('Uncommitted baseline exists; inspect it before retrying')
    backup, snapshot = _baseline(target, original_backup)
    data.mkdir(parents=True, exist_ok=True)
    _snapshot(snapshot, _child(data, 'original'))
    _json(metadata, {'version': 1, 'target': str(target), 'original_backup': str(backup)})
    if not flag.exists():
        _json(flag, {'version': 1, 'mode': 'themed'})


def prepare(target, original_backup=None):
    """Freeze original appearance from a verified pre-install backup, once only.

    Installers may call this on every upgrade; a prepared baseline is reused.
    This does not apply appearance or launch the player.
    """
    target, profile, data, flag = _layout(target)
    with _locked(profile):
        _prepare(target, profile, data, flag, original_backup)
    return data / 'baseline.json'


def _apply_files(profile, branch, files):
    for relative in APPEARANCE_PATHS:
        destination = _child(profile, relative)
        _remove(destination)
        if files[relative]:
            _copy(_child(branch, 'files/' + relative), destination)


def _apply_rows(connection, rows):
    for table in TABLES:
        names = [name for name, in connection.execute(f'SELECT name FROM {table}') if _appearance_key(name)]
        connection.executemany(f'DELETE FROM {table} WHERE name=?', ((name,) for name in names))
        connection.executemany(f'INSERT INTO {table}(name,value) VALUES(?,?)', rows[table])


def switch_mode(target, mode='toggle', original_backup=None):
    """Snapshot current appearance and transactionally apply the other branch."""
    if mode not in ('original', 'themed', 'toggle'):
        raise ValueError('Unknown integration mode')
    target, profile, data, flag = _layout(target)
    with _locked(profile):
        _prepare(target, profile, data, flag, original_backup)
        state = json.loads(flag.read_text(encoding='utf-8'))
        current = state.get('mode')
        if state.get('version') != 1 or current not in ('original', 'themed'):
            raise ValueError('Invalid integration mode flag')
        requested = ('original' if current == 'themed' else 'themed') if mode == 'toggle' else mode
        if requested == current:
            return current
        destination = _child(data, requested)
        files, rows = _load_branch(destination)  # Validate everything before changing current state.
        for relative in APPEARANCE_PATHS:
            _tree(_child(profile, relative))
        source = _child(data, current)
        _snapshot(profile, source)
        rollback_files, _ = _load_branch(source)
        with closing(sqlite3.connect(_child(profile, 'config.sqlite').as_uri() + '?mode=rw', uri=True, timeout=5)) as connection:
            connection.execute('BEGIN IMMEDIATE')
            try:
                _apply_rows(connection, rows)
                _apply_files(profile, destination, files)
                _json(flag, {'version': 1, 'mode': requested})
                connection.commit()
            except Exception:
                connection.rollback()
                # Keep the complete source branch for manual recovery if disk failure persists.
                _apply_files(profile, source, rollback_files)
                _json(flag, state)
                raise
    return requested


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True, type=Path)
    parser.add_argument('--mode', choices=('original', 'themed', 'toggle'), default='toggle')
    parser.add_argument('--prepare', action='store_true')
    parser.add_argument('--original-backup', type=Path)
    args = parser.parse_args()
    print(prepare(args.target, args.original_backup) if args.prepare else switch_mode(args.target, args.mode, args.original_backup))
