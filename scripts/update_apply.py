"""Offline update validation and application, using only the installed helper code.

No archive scripts are imported or executed. The launcher owns normal exit and
restart; this backend refuses an image locked by a live player.
"""
import argparse
from contextlib import contextmanager, ExitStack
import datetime
import hashlib
import json
import os
from pathlib import Path, PureWindowsPath
import re
import shutil
import stat
import sys
import zipfile

RELEASES = 'https://github.com/CuteHeibai/foobar-smartshuffle/releases/'
MAX_ARCHIVE = 1024 * 1024 * 1024
MAX_UNPACKED = 2 * 1024 * 1024 * 1024
MAX_MEMBER = 512 * 1024 * 1024
MAX_ENTRIES = 20000
VERSION = re.compile(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z')
DEVICE = re.compile(r'(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?\Z', re.I)


def no_links(path):
    path = Path(path).absolute()
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('Unsafe link or reparse point: ' + str(item))
        if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
            raise ValueError('Unsupported filesystem entry: ' + str(item))
    return path


def check_tree(root):
    no_links(root)
    if Path(root).is_dir():
        for directory, folders, files in os.walk(root, followlinks=False):
            for name in folders + files:
                no_links(Path(directory) / name)


def read_json(path):
    path = no_links(path)
    if path.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('JSON document exceeds the update limit')
    value = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(value, dict):
        raise ValueError('Expected a JSON object')
    return value


def write_json(path, value):
    path = no_links(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = no_links(path.with_name(path.name + '.tmp'))
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def validate_job(target, job):
    if not Path(target).is_absolute() or not Path(job).is_absolute():
        raise ValueError('Update target and job must be absolute paths')
    target, job = no_links(target), no_links(job)
    if not no_links(target / 'foobar2000.exe').is_file() or not no_links(target / 'portable_mode_enabled').is_file():
        raise ValueError('A marked portable foobar2000 target is required')
    owned = target / 'profile/smartshuffle/updates'
    if job.parent != owned or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}', job.name):
        raise ValueError('Update job is outside its owned directory')
    document = read_json(job / 'job.json')
    if document.get('version') != 1 or document.get('target') != str(target):
        raise ValueError('Invalid update job target or schema')
    edition = document.get('edition')
    marker = no_links(target / 'profile/smartshuffle/installation.json')
    if marker.exists():
        installed_edition = read_json(marker).get('edition')
    else:
        # A standalone component has no installer marker. Match the native
        # updater's existing-theme inference only for that absent-marker case.
        installed_edition = 'full' if no_links(target / 'profile/verdant/main.js').is_file() else 'core'
    if edition not in ('core', 'full') or installed_edition != edition:
        raise ValueError('Update edition differs from the installed edition')
    if type(document.get('pid')) is not int or document['pid'] < 0:
        raise ValueError('Invalid update parent PID')
    current = document.get('current')
    release = document.get('release')
    if not isinstance(release, dict) or not isinstance(current, str) or not VERSION.fullmatch(current):
        raise ValueError('Invalid current version or release')
    version = release.get('version')
    if not isinstance(version, str) or not VERSION.fullmatch(version):
        raise ValueError('Invalid release version')
    if tuple(map(int, version.split('.'))) <= tuple(map(int, current.split('.'))):
        raise ValueError('The update must be newer than the installed version')
    asset = f'foobar-smartshuffle-{edition}-{version}.zip'
    if (release.get('tag') != 'v' + version or release.get('asset') != asset or
            release.get('url') != RELEASES + f'download/v{version}/{asset}' or
            release.get('page') != RELEASES + f'tag/v{version}'):
        raise ValueError('Update must use the exact official release URL and edition asset')
    if not isinstance(release.get('sha256'), str) or not re.fullmatch(r'[0-9a-f]{64}', release['sha256']):
        raise ValueError('Missing or invalid release SHA-256')
    if type(release.get('size')) is not int or not 0 < release['size'] <= MAX_ARCHIVE:
        raise ValueError('Invalid release archive size')
    return target, job, document


@contextmanager
def locked_read(path):
    """Deny replacement/writes on Windows while validation and copying use a file."""
    path = no_links(path)
    if os.name != 'nt':
        with path.open('rb') as stream:
            yield stream
        return
    import ctypes
    from ctypes import wintypes
    import msvcrt
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                                  wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    handle = kernel.CreateFileW(str(path), 0x80000000, 1, None, 3, 0x80, None)
    if handle == wintypes.HANDLE(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    with os.fdopen(descriptor, 'rb') as stream:
        yield stream


def digest(stream):
    result = hashlib.sha256()
    size = 0
    while True:
        block = stream.read(1024 * 1024)
        if not block:
            break
        size += len(block)
        result.update(block)
    return {'sha256': result.hexdigest(), 'size': size}


def archive_manifest(stream, document, destination=None):
    release, edition = document['release'], document['edition']
    measured = digest(stream)
    if measured != {'sha256': release['sha256'], 'size': release['size']}:
        raise ValueError('Update archive size or SHA-256 mismatch')
    stream.seek(0)
    prefix = f"foobar-smartshuffle-{edition}-{release['version']}/"
    records, seen, total = {}, set(), 0
    try:
        with zipfile.ZipFile(stream) as archive:
            entries = archive.infolist()
            if not entries or len(entries) > MAX_ENTRIES:
                raise ValueError('Update archive entry limit exceeded')
            # Validate the complete directory before creating any extracted file.
            for entry in entries:
                name = entry.filename
                parts = name.rstrip('/').split('/')
                if ('\\' in name or not name.startswith(prefix) or '\x00' in name or
                        PureWindowsPath(name).drive or any(not p or p in ('.', '..') or
                        p[-1:] in (' ', '.') or ':' in p or DEVICE.fullmatch(p) or
                        any(ord(c) < 32 or c in '<>"|?*' for c in p) for p in parts)):
                    raise ValueError('Unsafe update ZIP path: ' + name)
                key = name.rstrip('/').casefold()
                if key in seen:
                    raise ValueError('Duplicate update ZIP path: ' + name)
                seen.add(key)
                mode = entry.external_attr >> 16
                if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR) or entry.flag_bits & 1:
                    raise ValueError('Linked or encrypted ZIP entry is forbidden')
                if (entry.file_size > MAX_MEMBER or entry.file_size < 0 or
                        (entry.file_size > 1024 * 1024 and entry.file_size > max(1, entry.compress_size) * 1000)):
                    raise ValueError('ZIP entry exceeds extraction limits')
                total += entry.file_size
                if total > MAX_UNPACKED:
                    raise ValueError('ZIP exceeds total extraction limits')
            file_keys = {entry.filename.casefold() for entry in entries if not entry.is_dir()}
            for key in seen:
                if any('/'.join(key.split('/')[:i]) in file_keys for i in range(1, len(key.split('/')))):
                    raise ValueError('ZIP file/directory path collision')
            for entry in entries:
                if entry.is_dir():
                    continue
                with archive.open(entry) as member:
                    data = member.read(MAX_MEMBER + 1)
                if len(data) != entry.file_size or len(data) > MAX_MEMBER:
                    raise ValueError('ZIP entry size differs from its directory')
                records[entry.filename] = {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}
                if destination is not None:
                    path = no_links(destination / entry.filename)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with path.open('xb') as out:
                        out.write(data)
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as error:
        raise ValueError('Invalid update ZIP: ' + str(error)) from error
    required = ['edition.json', 'payload/components/foo_smartshuffle/foo_smartshuffle.dll',
                'payload/runtime/smartshuffle-analyzer/smartshuffle-analyzer.exe']
    if edition == 'full':
        required += ['payload/theme/verdant/main.js', 'payload/config/foo_ui_columns.dll.cfg',
                     'payload/components/foo_ui_wizard/foo_ui_wizard.dll']
    for name in required:
        if not records.get(prefix + name, {}).get('size'):
            raise ValueError('Required update payload is missing or empty: ' + name)
    stream.seek(0)
    with zipfile.ZipFile(stream) as archive:
        metadata = archive.read(prefix + 'edition.json')
        if len(metadata) > 4096 or json.loads(metadata).get('edition') != edition:
            raise ValueError('Packaged edition metadata does not match this update')
    return {'version': 1, 'sha256': release['sha256'], 'size': release['size'], 'edition': edition,
            'release_version': release['version'], 'prefix': prefix, 'files': records}


def prepare(target, job):
    target, job, document = validate_job(target, job)
    # Reject unsafe existing install destinations while the player is still open.
    check_tree(target)
    staged = no_links(job / 'staged')
    with locked_read(job / 'package.zip') as stream:
        expected = archive_manifest(stream, document)
        if staged.exists():
            prepared = no_links(job / 'prepared.json')
            if prepared.exists() and read_json(prepared) != expected:
                raise ValueError('A different package has already been prepared in this job')
            verify_staged(staged, expected)
            # Recovery after an interrupted atomic manifest commit: archive and
            # existing files are revalidated, and no payload is extracted twice.
            if not prepared.exists():
                write_json(prepared, expected)
            return expected
        temporary = no_links(job / 'staged-pending')
        if temporary.exists():
            check_tree(temporary)
            shutil.rmtree(temporary)
        temporary.mkdir()
        try:
            stream.seek(0)
            archive_manifest(stream, document, temporary)
            temporary.rename(staged)
            write_json(job / 'prepared.json', expected)
        except Exception:
            if temporary.exists():
                check_tree(temporary)
                shutil.rmtree(temporary)
            raise
    return expected


def verify_staged(staged, expected, stack=None):
    check_tree(staged)
    files = {p.relative_to(staged).as_posix(): p for p in staged.rglob('*') if p.is_file()}
    if files.keys() != expected['files'].keys():
        raise ValueError('Prepared update file inventory changed')
    with ExitStack() as local:
        owner = stack if stack is not None else local
        for name, path in files.items():
            stream = owner.enter_context(locked_read(path))
            if digest(stream) != expected['files'][name]:
                raise ValueError('Prepared update content changed: ' + name)


def ensure_stopped(target, document):
    if os.name != 'nt':
        return
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                                  wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    # A running image cannot be opened for writing. The handle is never written.
    handle = kernel.CreateFileW(str(target / 'foobar2000.exe'), 0x40000000, 7, None, 3, 0x80, None)
    if handle == wintypes.HANDLE(-1).value:
        raise ValueError('Target player is still running or its executable is locked')
    kernel.CloseHandle(handle)


def result(target, job, document, ok, error=None, backup=None):
    report = {'ok': ok, 'version': document.get('release', {}).get('version'),
              'edition': document.get('edition'), 'job': str(job), 'error': str(error)[:4096] if error else None,
              'backup': str(backup) if backup else None,
              'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    write_json(Path(target) / 'profile/smartshuffle/update-result.json', report)
    return report


def apply(target, job):
    target, job, document = validate_job(target, job)
    backup = None
    before = set((target / 'smartshuffle-backups').glob('*'))
    try:
        ensure_stopped(target, document)
        # The local install backend follows existing directories, so reject links
        # in the target before allowing it to make its bounded install mappings.
        check_tree(target)
        with ExitStack() as locks:
            stream = locks.enter_context(locked_read(job / 'package.zip'))
            expected = archive_manifest(stream, document)
            if read_json(job / 'prepared.json') != expected:
                raise ValueError('Prepared update does not match the verified archive')
            verify_staged(job / 'staged', expected, locks)
            import install
            # Import resolution is the copied helper directory, never staged/scripts.
            if Path(install.__file__).resolve() != Path(__file__).with_name('install.py').resolve():
                raise ValueError('Trusted local installer is unavailable')
            backup = install.install(job / 'staged' / expected['prefix'] / 'payload', target,
                                     with_eslyric=False, edition=document['edition'])
        return result(target, job, document, True, backup=backup)
    except Exception as error:
        new_backups = set((target / 'smartshuffle-backups').glob('*')) - before
        if new_backups:
            backup = max(new_backups, key=lambda p: p.name)
        result(target, job, document, False, error, backup)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    phase = parser.add_mutually_exclusive_group(required=True)
    phase.add_argument('--prepare', action='store_true')
    phase.add_argument('--apply', action='store_true')
    parser.add_argument('--target', required=True, type=Path)
    parser.add_argument('--job', required=True, type=Path)
    args = parser.parse_args()
    try:
        output = prepare(args.target, args.job) if args.prepare else apply(args.target, args.job)
        print(json.dumps(output, ensure_ascii=False))
        return 0
    except Exception as error:
        # Validate the ownership boundary before writing diagnostics on failure.
        try:
            target, job, document = validate_job(args.target, args.job)
            existing = target / 'profile/smartshuffle/update-result.json'
            if args.prepare or not existing.is_file() or read_json(existing).get('job') != str(job):
                result(target, job, document, False, error)
        except Exception:
            pass
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
