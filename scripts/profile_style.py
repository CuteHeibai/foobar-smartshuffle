"""Migrate supported foobar UI settings in a stopped, backed-up profile.

Exact GUID/length records only. Unknown components, scripts, layouts, audio
settings and undocumented ESLyric fields are never searched/replaced.
The caller owns profile backup/rollback (the installer supplies both).
"""
import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import struct
import uuid

MAGIC = bytes.fromhex('d13d22b2c415f546803196e692bc1e20')
# foobar2000 v2 component envelope: MD5(this fixed salt + raw cfg_var body).
# Established from the host's checksum writer and independent existing files.
CHECKSUM_SALT = bytes.fromhex('63f8b12d14d12248acaf8f24bb085253')
FONT_ID = '6b71f91c-6b7e-4dbe-b27b-c493aa513fd0'
COLOR_ID = '15fd4ff9-0622-4077-bfbb-df0102b6a068'
DARK_ID = '1278cd90-1d95-48e8-873a-01f9ad2dbc5f'
EDITOR_ID = 'd429d322-d236-7356-3325-4b67c5d4503e'
LEGACY_FONT_ID = 'd61b2f01-a845-c1f5-9937-26ab7470f50f'
ESL_ID = '3544b96e-1649-4c28-9688-cccc479186ba'
ESL_KEY = 'ui.elem.36A795A3-110B-4398-995A-84CEA2B13427.config'


class Unsupported(ValueError):
    """A structurally intact but unrecognized supported-setting version."""


class Reader:
    def __init__(self, data):
        self.data, self.pos = data, 0

    def take(self, size):
        if size < 0 or size > len(self.data) - self.pos:
            raise ValueError('Truncated configuration structure')
        result = self.data[self.pos:self.pos + size]
        self.pos += size
        return result

    def uint(self):
        return struct.unpack('<I', self.take(4))[0]

    def block(self):
        return self.take(self.uint())

    def done(self):
        if self.pos != len(self.data):
            raise Unsupported('Unrecognized configuration extension')


def _uint(value):
    return struct.pack('<I', value)


def _block(value):
    return _uint(len(value)) + value


def read_records(data):
    """Decode the observed v2 component envelope and SDK cfg_var records."""
    reader = Reader(data)
    if reader.take(16) != MAGIC:
        raise ValueError('Unrecognized component configuration envelope')
    checksum = reader.take(16)
    if reader.uint() != len(data) - 36:
        raise ValueError('Component configuration body length mismatch')
    if checksum != hashlib.md5(CHECKSUM_SALT + data[36:]).digest():
        raise ValueError('Component configuration checksum mismatch')
    result, seen = [], set()
    while reader.pos < len(data):
        guid = str(uuid.UUID(bytes_le=reader.take(16)))
        if guid in seen:
            raise ValueError('Duplicate configuration GUID: ' + guid)
        seen.add(guid)
        result.append((guid, reader.block()))
    return result


def _records(data, records):
    body = b''.join(uuid.UUID(guid).bytes_le + _block(value) for guid, value in records)
    checksum = hashlib.md5(CHECKSUM_SALT + body).digest()
    return data[:16] + checksum + _block(body)


def _font(data, family):
    if len(data) != 92:
        raise ValueError('Invalid LOGFONTW length')
    # DEFAULT_CHARSET allows Windows font mapping/linking for Chinese glyphs.
    return data[:23] + b'\x01' + data[24:28] + family.encode('utf-16le').ljust(64, b'\0')


def _font_v2(data, family):
    """Keep weight/stretch/style, size and axes; update cached family names."""
    r = Reader(data)
    has_wss = r.take(1)
    if has_wss not in (b'\0', b'\1'):
        raise Unsupported('Unknown DirectWrite font description')
    output = has_wss
    if has_wss == b'\1':
        r.block().decode('utf-8')
        output += _block(family.encode('utf-8')) + r.take(16)
    if r.pos < len(data):
        previous = r.block().decode('utf-8')
        output += _block(family.encode('utf-8') if previous else b'')
        axes = r.uint()
        output += _uint(axes) + r.take(axes * 8)
    r.done()
    return output


def _fonts(data, family):
    r = Reader(data)
    if r.uint() != 0:
        raise Unsupported('Unsupported Columns UI font version')
    common = [r.take(112), r.take(112)]
    count = r.uint()
    if count > (len(data) - r.pos) // 112:
        raise ValueError('Invalid Columns UI font client count')
    entries = common + [r.take(112) for _ in range(count)]
    changed, migrated = 0, []
    for entry in entries:
        if struct.unpack_from('<I', entry, 16)[0] > 3:
            raise Unsupported('Unknown Columns UI font mode')
        replacement = entry[:16] + _uint(2) + _font(entry[20:], family)
        changed += replacement != entry
        migrated.append(replacement)
    output = bytes(4) + b''.join(migrated[:2]) + _uint(count) + b''.join(migrated[2:])
    # Optional size and DirectWrite extensions occur as complete arrays.
    if r.pos < len(data):
        for _ in entries:
            extra = r.block()
            if len(extra) < 4:
                raise ValueError('Invalid Columns UI point size')
            output += _block(extra)
    if r.pos < len(data):
        for _ in entries:
            output += _block(_font_v2(r.block(), family))
    r.done()
    return output, changed


def _colors(data):
    r = Reader(data)
    if r.uint() != 0:
        raise Unsupported('Unsupported Columns UI color version')
    output, changed = bytes(4), 0
    # Both the light and optional dark banks receive the same dark palette.
    for bank in range(2):
        if bank and r.pos == len(data):
            break
        global_entry = r.take(49)
        count = r.uint()
        if count > (len(data) - r.pos) // 49:
            raise ValueError('Invalid Columns UI color client count')
        entries = [global_entry] + [r.take(49) for _ in range(count)]
        replacements = []
        for entry in entries:
            if struct.unpack_from('<I', entry, 16)[0] > 3 or entry[-1] not in (0, 1):
                raise Unsupported('Unknown Columns UI color scheme')
            replacement = entry[:16] + struct.pack('<8IB', 3, 0xe1e1e1, 0xe1e1e1,
                0xe1e1e1, 0x121212, 0x3c3c3c, 0x282828, 0x60d71e, 1)
            changed += replacement != entry
            replacements.append(replacement)
        output += replacements[0] + _uint(count) + b''.join(replacements[1:])
    r.done()
    return output, changed


def _varint(value):
    result = bytearray()
    while value > 127:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return bytes(result)


def _read_varint(r):
    value = 0
    for shift in range(0, 70, 7):
        byte = r.take(1)[0]
        value |= (byte & 127) << shift
        if not byte & 128:
            if value >= 1 << 64:
                break
            return value
    raise Unsupported('Invalid protobuf varint')


def _protobuf(data):
    r, result = Reader(data), []
    while r.pos < len(data):
        start = r.pos
        tag = _read_varint(r)
        number, wire = tag >> 3, tag & 7
        if not number or number >= 1 << 29:
            raise Unsupported('Invalid protobuf field number')
        if wire == 0:
            value = _read_varint(r)
        elif wire in (1, 5):
            value = r.take(8 if wire == 1 else 4)
        elif wire == 2:
            value = r.take(_read_varint(r))
        else:
            raise Unsupported('Unsupported protobuf wire type')
        result.append((number, wire, value, data[start:r.pos]))
    return result


def _eslyric(data, family):
    fields = _protobuf(data)
    selected = {}
    for number, wire, value, _ in fields:
        if number in (1, 2, 7):
            if number in selected:
                raise Unsupported('Duplicate ESLyric schema field')
            selected[number] = (wire, value)
    # Captured ESLyric 1.0.6.7 panel marker, panel UUID and nested LOGFONT.
    if selected.get(1) != (0, 4543308) or selected.get(2, (None,))[0] != 2 or selected.get(7, (None,))[0] != 2:
        raise Unsupported('Unknown ESLyric panel schema')
    try:
        uuid.UUID(selected[2][1].decode('ascii'))
    except (ValueError, UnicodeError) as exc:
        raise Unsupported('Unknown ESLyric panel identifier') from exc
    font_fields = _protobuf(selected[7][1])
    known = {}
    for number, wire, value, _ in font_fields:
        if number in range(1, 6):
            if number in known:
                raise Unsupported('Duplicate ESLyric font field')
            known[number] = (wire, value)
    if set(known) != set(range(1, 6)) or any(known[n][0] != 0 for n in range(1, 5)) or known[5][0] != 2:
        raise Unsupported('Unknown ESLyric font schema')
    if not (0 < known[1][1] <= 2000 and 0 < known[2][1] <= 1000 and known[3][1] in (0, 1) and known[4][1] <= 255):
        raise Unsupported('Implausible ESLyric font metrics')
    _validate_family(known[5][1].decode('utf-8'))
    font = b''.join(b'\x20\x01' if n == 4 else b'\x2a' + _varint(len(family.encode('utf-8'))) + family.encode('utf-8') if n == 5 else raw
                    for n, _, _, raw in font_fields)
    return b''.join(b'\x3a' + _varint(len(font)) + font if n == 7 else raw for n, _, _, raw in fields)


def _validate_family(family):
    if not isinstance(family, str) or not family.strip() or len(family.encode('utf-16le')) > 62 or any(ord(ch) < 32 for ch in family):
        raise ValueError('Font family must contain 1 to 31 UTF-16 characters without controls')


@contextmanager
def _offline_profile(profile):
    """Keep an existing Windows running marker exclusively open while editing.

    The marker can survive a prior exit. Existence alone does not prove that
    foobar holds it. Never delete/recreate the marker or infer locks from PIDs.
    """
    marker = profile / 'running'
    try:
        marker.stat()
    except FileNotFoundError:
        yield
        return
    except OSError as exc:
        raise ValueError('Profile running marker cannot be inspected safely') from exc
    if os.name != 'nt':
        raise ValueError('Profile has a running marker; offline state cannot be verified on this platform')
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    create_file = kernel32.CreateFileW
    create_file.argtypes = (wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                            wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE)
    create_file.restype = wintypes.HANDLE
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = (wintypes.HANDLE,)
    close_handle.restype = wintypes.BOOL
    # GENERIC_READ, no sharing, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL.
    handle = create_file(str(marker), 0x80000000, 0, None, 3, 0x80, None)
    if handle == ctypes.c_void_p(-1).value:
        error = ctypes.get_last_error()
        raise ValueError('Profile running marker cannot be opened exclusively (Windows error '
                         + str(error) + '); stop the player or resolve access before migration') from ctypes.WinError(error)
    try:
        yield
    finally:
        if not close_handle(handle):
            raise ctypes.WinError(ctypes.get_last_error())


def apply_profile(profile, family='Microsoft YaHei UI'):
    """Apply to an offline profile; return changed counts and unsupported settings.

    No player is launched or closed. On Windows an existing running marker
    must open exclusively and remains held for this migration; stale markers
    are retained. Other platforms conservatively reject marker presence.
    All candidate files/rows are parsed before writes. Caller must back up
    configuration/foo_ui_columns.dll.cfg, foo_uie_eslyric.dll.cfg and config.sqlite.
    """
    profile = Path(profile).resolve()
    _validate_family(family)
    with _offline_profile(profile):
        return _apply_profile(profile, family)


def _apply_profile(profile, family):
    result = dict(columns_fonts=0, columns_colors=0, columns_dark_mode=0,
                  eslyric_fonts=0, files_changed=[], unsupported=[])
    pending = []

    def convert(label, value, function, counter):
        try:
            replacement = function(value)
        except (Unsupported, UnicodeError) as exc:
            result['unsupported'].append(label + ': ' + str(exc))
            return value
        if isinstance(replacement, tuple):
            replacement, count = replacement
        else:
            count = replacement != value
        result[counter] += count
        return replacement

    for filename in ('foo_ui_columns.dll.cfg', 'foo_uie_eslyric.dll.cfg'):
        path = profile / 'configuration' / filename
        if not path.exists():
            continue
        before = path.read_bytes()
        after_records = []
        for guid, value in read_records(before):
            label = filename + ':' + guid
            if filename == 'foo_ui_columns.dll.cfg':
                if guid == FONT_ID:
                    value = convert(label, value, lambda v: _fonts(v, family), 'columns_fonts')
                elif guid == COLOR_ID:
                    value = convert(label, value, _colors, 'columns_colors')
                elif guid == DARK_ID:
                    if len(value) != 4 or int.from_bytes(value, 'little') > 2:
                        raise ValueError('Invalid Columns UI dark mode setting')
                    value = convert(label, value, lambda v: _uint(1), 'columns_dark_mode')
                elif guid in (EDITOR_ID, LEGACY_FONT_ID):
                    if len(value) not in ((92, 96) if guid == EDITOR_ID else (92,)):
                        raise ValueError('Invalid Columns UI editor/legacy font')
                    value = convert(label, value, lambda v: _font(v[:92], family) + v[92:], 'columns_fonts')
            elif guid == ESL_ID:
                # The outer cfg_var is known; unrecognized protobuf remains intact.
                try:
                    value = convert(label, value, lambda v: _eslyric(v, family), 'eslyric_fonts')
                except ValueError as exc:
                    result['unsupported'].append(label + ': ' + str(exc))
            after_records.append((guid, value))
        after = _records(before, after_records)
        if after != before:
            pending.append((path, after))

    database = profile / 'config.sqlite'
    db_changes = []
    if database.exists():
        with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as connection:
            for key in (ESL_KEY, 'smartshuffle.lyrics.panel.config'):
                row = connection.execute('SELECT value FROM configBlobs WHERE name=?', (key,)).fetchone()
                if row:
                    try:
                        after = convert(key, row[0], lambda v: _eslyric(v, family), 'eslyric_fonts')
                    except ValueError as exc:
                        result['unsupported'].append(key + ': ' + str(exc))
                        after = row[0]
                    if after != row[0]:
                        db_changes.append((key, row[0], after))
    # The installer handles rollback of the combined file/database operation.
    if db_changes:
        with closing(sqlite3.connect(database.as_uri() + '?mode=rw', uri=True)) as connection, connection:
            for key, before, after in db_changes:
                cursor = connection.execute('UPDATE configBlobs SET value=? WHERE name=? AND value=?', (after, key, before))
                if cursor.rowcount != 1:
                    raise ValueError('ESLyric config changed while preparing migration')
        result['files_changed'].append('config.sqlite')
    for path, after in pending:
        temporary = path.with_name(path.name + '.style-tmp')
        try:
            temporary.write_bytes(after)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        result['files_changed'].append(str(path.relative_to(profile)))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile', type=Path)
    parser.add_argument('--family', default='Microsoft YaHei UI')
    args = parser.parse_args()
    print(json.dumps(apply_profile(args.profile, args.family), ensure_ascii=False, indent=2))
