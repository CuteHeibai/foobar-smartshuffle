"""Offline fixtures exercise real config records, never an installed player."""
from contextlib import closing
import hashlib
import os
from pathlib import Path
import sqlite3
import struct
import sys
import tempfile
import unittest
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import profile_style as style


FONT_ID = '6b71f91c-6b7e-4dbe-b27b-c493aa513fd0'
COLOR_ID = '15fd4ff9-0622-4077-bfbb-df0102b6a068'
DARK_ID = '1278cd90-1d95-48e8-873a-01f9ad2dbc5f'
ESL_ID = '3544b96e-1649-4c28-9688-cccc479186ba'
ESL_KEY = 'ui.elem.36A795A3-110B-4398-995A-84CEA2B13427.config'


def record(guid, value):
    return uuid.UUID(guid).bytes_le + struct.pack('<I', len(value)) + value


def container(*records):
    body = b''.join(records)
    checksum = hashlib.md5(bytes.fromhex('63f8b12d14d12248acaf8f24bb085253') + body).digest()
    return bytes.fromhex('d13d22b2c415f546803196e692bc1e20') + checksum + struct.pack('<I', len(body)) + body


def logfont(face='SimSun', height=-18, weight=700):
    return struct.pack('<5i8B', height, 0, 0, 0, weight, 1, 0, 0, 134, 0, 0, 5, 0) + face.encode('utf-16le').ljust(64, b'\0')


def font_manager():
    common = bytes(16) + struct.pack('<I', 3) + logfont()
    client = bytes.fromhex('00112233445566778899aabbccddeeff') + struct.pack('<I', 2) + logfont('Cambria', -24, 400)
    # Extra point sizes, then old-format optional DirectWrite descriptions.
    extra = b''.join(struct.pack('<Ii', 4, n) for n in (135, 135, 180))
    return struct.pack('<I', 0) + common * 2 + struct.pack('<I', 1) + client + extra + (struct.pack('<I', 9) + bytes(9)) * 3


def color_manager():
    entry = bytes(16) + struct.pack('<8IB', 2, 0, 1, 2, 0xffffff, 3, 4, 5, 0)
    override = bytes.fromhex('00112233445566778899aabbccddeeff') + entry[16:]
    return bytes(4) + entry + struct.pack('<I', 1) + override + entry + struct.pack('<I', 1) + override


# Captured font message only: size=60, weight=400, italic=0, charset=134,
# family=SimSun. Unrelated caption intentionally also contains SimSun.
ESL = bytes.fromhex('08cca69502122430334536344242342d373746372d343931412d414331412d3543304345363430323945343a12083c10900318002086012a0653696d53756e') + b'\xca\x02\x06SimSun'


class ProfileStyleTests(unittest.TestCase):
    def make_profile(self, root, columns=None, eslyric=None):
        root = Path(root)
        (root / 'configuration').mkdir()
        if columns is not None:
            (root / 'configuration/foo_ui_columns.dll.cfg').write_bytes(columns)
        if eslyric is not None:
            (root / 'configuration/foo_uie_eslyric.dll.cfg').write_bytes(container(record(ESL_ID, eslyric)))
        return root

    def test_known_salted_checksum_vectors_read_correctly(self):
        # Literal independently calculated vectors, including one GUID record.
        empty = bytes.fromhex('d13d22b2c415f546803196e692bc1e20aa55fb88ea19fcddad3b13c9a9df464500000000')
        one = bytes.fromhex('d13d22b2c415f546803196e692bc1e20235e0d05dabf401783ef049ab22ca7f117000000') + bytes(16) + b'\x03\0\0\0abc'
        self.assertEqual(style.read_records(empty), [])
        self.assertEqual(style.read_records(one), [('00000000-0000-0000-0000-000000000000', b'abc')])

    def test_font_migration_changes_all_clients_but_preserves_metrics_and_unknown_records(self):
        before = font_manager()
        unrelated = record('01234567-89ab-cdef-0123-456789abcdef', b'SimSun unrelated')
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(FONT_ID, before), unrelated))
            result = style.apply_profile(root)
            after = (root / 'configuration/foo_ui_columns.dll.cfg').read_bytes()
            self.assertEqual(result['columns_fonts'], 3)
            self.assertTrue(after.endswith(unrelated))
            self.assertEqual(after[:16], container()[:16])
            self.assertEqual(after[16:32], hashlib.md5(bytes.fromhex('63f8b12d14d12248acaf8f24bb085253') + after[36:]).digest())
            payload = dict(style.read_records(after))[FONT_ID]
            for offset in (4, 116, 232):
                self.assertEqual(struct.unpack_from('<I', payload, offset + 16)[0], 2)
                self.assertEqual(payload[offset + 48:offset + 112], 'Microsoft YaHei UI'.encode('utf-16le').ljust(64, b'\0'))
                self.assertEqual(payload[offset + 20:offset + 43], before[offset + 20:offset + 43])
            self.assertEqual(payload[344:], before[344:])
            self.assertEqual(style.apply_profile(root)['files_changed'], [])

    def test_dark_palette_replaces_common_and_plugin_overrides_in_both_modes(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(COLOR_ID, color_manager()), record(DARK_ID, bytes(4))))
            result = style.apply_profile(root)
            records = dict(style.read_records((root / 'configuration/foo_ui_columns.dll.cfg').read_bytes()))
            self.assertEqual(result['columns_colors'], 4)
            self.assertEqual(result['columns_dark_mode'], 1)
            self.assertEqual(records[DARK_ID], b'\x01\0\0\0')
            for offset in (4, 57, 106, 159):
                # scheme=Custom; text=225; bg=18, green active frame.
                values = struct.unpack_from('<8IB', records[COLOR_ID], offset + 16)
                self.assertEqual(values, (3, 0xe1e1e1, 0xe1e1e1, 0xe1e1e1, 0x121212, 0x3c3c3c, 0x282828, 0x60d71e, 1))

    def test_directwrite_family_cache_cannot_keep_the_old_font(self):
        basic = font_manager()[:368]  # Base entries and point-size extension.
        name = b'Cambria'
        details = b'\x01' + struct.pack('<I', len(name)) + name + struct.pack('<iiif', 700, 5, 2, 24.0)
        details += struct.pack('<I', len(name)) + name + struct.pack('<IIf', 1, 0x74686777, 650.0)
        data = basic + (struct.pack('<I', len(details)) + details) * 3
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(FONT_ID, data)))
            style.apply_profile(root)
            after = dict(style.read_records((root / 'configuration/foo_ui_columns.dll.cfg').read_bytes()))[FONT_ID]
            self.assertNotIn(b'Cambria', after)
            self.assertEqual(after.count(b'Microsoft YaHei UI'), 6)
            self.assertEqual(after.count(struct.pack('<iiif', 700, 5, 2, 24.0)), 3)
            self.assertEqual(after.count(struct.pack('<IIf', 1, 0x74686777, 650.0)), 3)

    def test_editor_and_legacy_fonts_preserve_point_size_and_metrics(self):
        editor = logfont() + struct.pack('<i', 135)
        legacy = logfont('Cambria', -24, 400)
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record('d429d322-d236-7356-3325-4b67c5d4503e', editor), record('d61b2f01-a845-c1f5-9937-26ab7470f50f', legacy)))
            result = style.apply_profile(root)
            after = dict(style.read_records((root / 'configuration/foo_ui_columns.dll.cfg').read_bytes()))
            self.assertEqual(result['columns_fonts'], 2)
            self.assertEqual(after['d429d322-d236-7356-3325-4b67c5d4503e'][92:], struct.pack('<i', 135))
            self.assertEqual(after['d61b2f01-a845-c1f5-9937-26ab7470f50f'][:23], legacy[:23])

    def test_eslyric_font_updates_only_nested_family_and_charset_in_component_and_dui(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, eslyric=ESL)
            with closing(sqlite3.connect(root / 'config.sqlite')) as c, c:
                c.execute('CREATE TABLE configBlobs(name TEXT PRIMARY KEY,value BLOB)')
                c.executemany('INSERT INTO configBlobs VALUES(?,?)', [(ESL_KEY, ESL), ('core.output', b'untouched')])
            result = style.apply_profile(root)
            actual = dict(style.read_records((root / 'configuration/foo_uie_eslyric.dll.cfg').read_bytes()))[ESL_ID]
            expected = ESL[:43] + bytes.fromhex('3a1d083c109003180020012a12') + b'Microsoft YaHei UI' + ESL[63:]
            self.assertEqual(actual, expected)
            self.assertEqual(result['eslyric_fonts'], 2)
            with closing(sqlite3.connect(root / 'config.sqlite')) as c:
                self.assertEqual(c.execute('SELECT value FROM configBlobs WHERE name=?', (ESL_KEY,)).fetchone()[0], expected)
                self.assertEqual(c.execute("SELECT value FROM configBlobs WHERE name='core.output'").fetchone()[0], b'untouched')

    def test_unknown_eslyric_schema_is_preserved_and_reported(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, eslyric=b'unknown future schema')
            path = root / 'configuration/foo_uie_eslyric.dll.cfg'
            before = path.read_bytes()
            result = style.apply_profile(root)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(result['eslyric_fonts'], 0)
            self.assertTrue(result['unsupported'])

    def test_truncated_or_duplicate_cfg_records_fail_before_any_file_changes(self):
        for invalid in (container(record(FONT_ID, font_manager()))[:-1], container(record(FONT_ID, font_manager()), record(FONT_ID, font_manager()))):
            with self.subTest(invalid=invalid[:36]), tempfile.TemporaryDirectory() as d:
                root = self.make_profile(d, invalid, ESL)
                paths = list((root / 'configuration').iterdir())
                before = {p: p.read_bytes() for p in paths}
                with self.assertRaises(ValueError):
                    style.apply_profile(root)
                self.assertEqual({p: p.read_bytes() for p in paths}, before)

    def test_bad_checksum_is_rejected_before_profile_changes(self):
        with tempfile.TemporaryDirectory() as d:
            valid = container(record(FONT_ID, font_manager()))
            corrupt = valid[:16] + bytes(16) + valid[32:]
            root = self.make_profile(d, corrupt, ESL)
            path = root / 'configuration/foo_ui_columns.dll.cfg'
            with self.assertRaises(ValueError):
                style.apply_profile(root)
            self.assertEqual(path.read_bytes(), corrupt)

    def test_future_columns_version_is_preserved_without_guessing(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(FONT_ID, b'\x01\0\0\0future')))
            p = root / 'configuration/foo_ui_columns.dll.cfg'
            before = p.read_bytes()
            self.assertTrue(style.apply_profile(root)['unsupported'])
            self.assertEqual(p.read_bytes(), before)

    def test_refuses_invalid_family(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(FONT_ID, font_manager())))
            for family in ('', 'a' * 32, 'bad\0font'):
                with self.assertRaises(ValueError):
                    style.apply_profile(root, family)
    @unittest.skipUnless(os.name == 'nt', 'Windows exclusive marker detection')
    def test_stale_running_marker_allows_offline_upgrade_and_is_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(FONT_ID, font_manager())))
            marker = root / 'running'
            marker.write_bytes(b'stale marker content')
            result = style.apply_profile(root)
            self.assertEqual(result['columns_fonts'], 3)
            self.assertEqual(marker.read_bytes(), b'stale marker content')

    @unittest.skipUnless(os.name == 'nt', 'Windows exclusive marker detection')
    def test_actual_exclusive_marker_handle_blocks_all_profile_changes(self):
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
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(FONT_ID, font_manager())))
            marker = root / 'running'
            marker.touch()
            config = root / 'configuration/foo_ui_columns.dll.cfg'
            before = config.read_bytes()
            handle = create_file(str(marker), 0x80000000, 0, None, 3, 0x80, None)
            self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
            try:
                with self.assertRaises(ValueError):
                    style.apply_profile(root)
                self.assertEqual(config.read_bytes(), before)
            finally:
                self.assertTrue(close_handle(handle))
            self.assertTrue(marker.exists())
            self.assertEqual(style.apply_profile(root)['columns_fonts'], 3)

    @unittest.skipIf(os.name == 'nt', 'Windows uses actual lock detection')
    def test_non_windows_marker_presence_remains_conservative(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d, container(record(FONT_ID, font_manager())))
            (root / 'running').touch()
            with self.assertRaises(ValueError):
                style.apply_profile(root)


    def test_saved_native_lyrics_panel_font_is_migrated_with_default_config(self):
        with tempfile.TemporaryDirectory() as d:
            root = self.make_profile(d)
            with closing(sqlite3.connect(root / 'config.sqlite')) as c, c:
                c.execute('CREATE TABLE configBlobs(name TEXT PRIMARY KEY,value BLOB)')
                c.executemany('INSERT INTO configBlobs VALUES(?,?)', [(ESL_KEY, ESL), ('smartshuffle.lyrics.panel.config', ESL)])
            style.apply_profile(root)
            with closing(sqlite3.connect(root / 'config.sqlite')) as c:
                for key in [ESL_KEY, 'smartshuffle.lyrics.panel.config']:
                    value = c.execute('SELECT value FROM configBlobs WHERE name=?', (key,)).fetchone()[0]
                    self.assertIn(b'Microsoft YaHei UI', value)
                    self.assertTrue(value.endswith(b'\xca\x02\x06SimSun'))

if __name__ == '__main__':
    unittest.main()
