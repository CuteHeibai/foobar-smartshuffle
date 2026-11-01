"""Offline disposable profiles only: never start or modify a user player."""
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
try:
    import switch_mode as switch
except ImportError:
    switch = None

UI_KEY = 'cfg_var.094A28DA-C6E8-4392-BAF1-AD0F29E5B303'
MODULES_KEY = 'cfg_var.AD13B1D4-A6F7-425E-A93B-2A3C7DC37A93'


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def database(path, label):
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as c, c:
        for table, kind in [('configBlobs', 'BLOB'), ('configStrings', 'TEXT'), ('configInts', 'INTEGER'), ('configReals', 'REAL')]:
            c.execute(f'CREATE TABLE {table}(name TEXT PRIMARY KEY, value {kind})')
        c.executemany('INSERT INTO configBlobs VALUES (?,?)', [(UI_KEY, label.encode()), (MODULES_KEY, label.encode()), ('ui.elem.example.config', label.encode())])
        c.execute('INSERT INTO configStrings VALUES (?,?)', ('core.output.device', label))
        c.execute('INSERT INTO configInts VALUES (?,?)', ('core.activePlaylistIndex', 3))
        c.execute('INSERT INTO configReals VALUES (?,?)', ('core.volume', -12))


class SwitchTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(switch, 'switch backend must exist')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'player'
        self.profile = self.root / 'profile'
        write(self.root / 'foobar2000.exe', b'fixture-not-executable')
        write(self.root / 'portable_mode_enabled', b'')
        self.backup = self.root / 'smartshuffle-backups/001'
        snap = self.backup / 'profile-snapshot'
        database(snap / 'config.sqlite', 'original')
        write(snap / 'configuration/foo_ui_std.dll.cfg', b'original-layout')
        write(snap / 'user-components-x64/foo_uie_eslyric/foo_uie_eslyric.dll', b'original-lyrics')
        (self.backup / 'manifest.json').write_text(json.dumps({'version': 1, 'target': str(self.root), 'entries': [{'path': 'profile/user-components-x64/foo_smartshuffle', 'existed': False}]}))
        database(self.profile / 'config.sqlite', 'themed')
        write(self.profile / 'configuration/foo_ui_std.dll.cfg', b'themed-default-layout')
        write(self.profile / 'configuration/foo_ui_columns.dll.cfg', b'themed-layout')
        write(self.profile / 'user-components-x64/foo_ui_columns/foo_ui_columns.dll', b'columns')
        write(self.profile / 'user-components-x64/foo_ui_wizard/foo_ui_wizard.dll', b'wizard')
        write(self.profile / 'user-components-x64/foo_uie_eslyric/foo_uie_eslyric.dll', b'patched-lyrics')
        write(self.profile / 'user-components-x64/foo_smartshuffle/foo_smartshuffle.dll', b'controller')

    def rows(self):
        with closing(sqlite3.connect(self.profile / 'config.sqlite')) as c:
            return {t: dict(c.execute(f'SELECT name,value FROM {t}')) for t in ['configBlobs', 'configStrings', 'configInts', 'configReals']}

    def test_switch_twice_keeps_current_music_playlists_output_and_preferences(self):
        for rel in ['playlists-v2.0/index.txt', 'smartshuffle/store.json', 'smartshuffle/features.json', 'playcount.dat', 'music/current.flac']:
            write(self.profile / rel, ('current-' + rel).encode())
        switch.prepare(self.root, self.backup)
        self.assertEqual(switch.switch_mode(self.root, 'original'), 'original')
        self.assertEqual((self.profile / 'configuration/foo_ui_std.dll.cfg').read_bytes(), b'original-layout')
        self.assertFalse((self.profile / 'user-components-x64/foo_ui_columns').exists())
        self.assertFalse((self.profile / 'user-components-x64/foo_ui_wizard').exists())
        self.assertEqual((self.profile / 'user-components-x64/foo_uie_eslyric/foo_uie_eslyric.dll').read_bytes(), b'original-lyrics')
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'original')
        write(self.profile / 'configuration/foo_ui_std.dll.cfg', b'original-customized')
        with closing(sqlite3.connect(self.profile / 'config.sqlite')) as c, c:
            c.execute("UPDATE configStrings SET value='new-device' WHERE name='core.output.device'")
            c.execute("INSERT INTO configStrings VALUES ('new.unrelated.preference','keep')")
            c.execute("UPDATE configReals SET value=-22 WHERE name='core.volume'")
            c.execute("UPDATE configBlobs SET value=? WHERE name='ui.elem.example.config'", (b'original-customized',))
        self.assertEqual(switch.switch_mode(self.root, 'toggle'), 'themed')
        self.assertEqual((self.profile / 'configuration/foo_ui_columns.dll.cfg').read_bytes(), b'themed-layout')
        self.assertTrue((self.profile / 'user-components-x64/foo_ui_wizard/foo_ui_wizard.dll').exists())
        self.assertEqual((self.profile / 'user-components-x64/foo_uie_eslyric/foo_uie_eslyric.dll').read_bytes(), b'patched-lyrics')
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')
        self.assertEqual(self.rows()['configStrings']['core.output.device'], 'new-device')
        self.assertEqual(self.rows()['configStrings']['new.unrelated.preference'], 'keep')
        self.assertEqual(self.rows()['configReals']['core.volume'], -22)
        for rel in ['playlists-v2.0/index.txt', 'smartshuffle/store.json', 'smartshuffle/features.json', 'playcount.dat', 'music/current.flac']:
            self.assertEqual((self.profile / rel).read_bytes(), ('current-' + rel).encode())
        self.assertEqual((self.profile / 'user-components-x64/foo_smartshuffle/foo_smartshuffle.dll').read_bytes(), b'controller')
        self.assertEqual(switch.switch_mode(self.root, 'original'), 'original')
        self.assertEqual((self.profile / 'configuration/foo_ui_std.dll.cfg').read_bytes(), b'original-customized')
        self.assertEqual(self.rows()['configBlobs']['ui.elem.example.config'], b'original-customized')
        self.assertEqual(json.loads((self.profile / 'smartshuffle/integration-mode.json').read_text())['mode'], 'original')

    def test_branch_merge_deletes_other_branch_ui_rows_without_deleting_new_unrelated_rows(self):
        with closing(sqlite3.connect(self.backup / 'profile-snapshot/config.sqlite')) as c, c:
            c.execute("INSERT INTO configBlobs VALUES ('ui.elem.original-only.config',?)", (b'original-only',))
        with closing(sqlite3.connect(self.profile / 'config.sqlite')) as c, c:
            c.execute("INSERT INTO configBlobs VALUES ('ui.elem.themed-only.config',?)", (b'themed-only',))
            c.execute("INSERT INTO configBlobs VALUES ('user.new.config',?)", (b'keep',))
        switch.prepare(self.root, self.backup)
        switch.switch_mode(self.root, 'original')
        self.assertNotIn('ui.elem.themed-only.config', self.rows()['configBlobs'])
        self.assertEqual(self.rows()['configBlobs']['ui.elem.original-only.config'], b'original-only')
        switch.switch_mode(self.root, 'themed')
        self.assertNotIn('ui.elem.original-only.config', self.rows()['configBlobs'])
        self.assertEqual(self.rows()['configBlobs']['ui.elem.themed-only.config'], b'themed-only')
        self.assertEqual(self.rows()['configBlobs']['user.new.config'], b'keep')

    def test_rejects_upgrade_and_wrong_target_as_original(self):
        manifest = self.backup / 'manifest.json'
        data = json.loads(manifest.read_text())
        data['entries'][0]['existed'] = True
        manifest.write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            switch.prepare(self.root, self.backup)
        data['entries'][0]['existed'] = False
        data['target'] = str(self.root.parent / 'other')
        manifest.write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            switch.prepare(self.root, self.backup)

    def test_prepare_reuses_frozen_original_even_when_new_backup_is_invalid(self):
        switch.prepare(self.root, self.backup)
        switch.prepare(self.root, self.root / 'smartshuffle-backups/new-upgrade')
        switch.switch_mode(self.root, 'original')
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'original')

    def test_rejects_branch_manifest_escape_before_any_mutation(self):
        switch.prepare(self.root, self.backup)
        branch = self.profile / 'smartshuffle/integration/original/manifest.json'
        data = json.loads(branch.read_text())
        data['files']['../../outside'] = True
        branch.write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            switch.switch_mode(self.root, 'original')
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')
        self.assertTrue((self.profile / 'user-components-x64/foo_ui_columns').exists())

    def test_failed_appearance_write_rolls_back_files_database_and_mode(self):
        switch.prepare(self.root, self.backup)
        original_apply = switch._apply_files
        calls = []
        def fail_once(*args):
            original_apply(*args)
            calls.append(1)
            if len(calls) == 1:
                raise OSError('simulated disk failure')
        with patch.object(switch, '_apply_files', side_effect=fail_once):
            with self.assertRaises(OSError):
                switch.switch_mode(self.root, 'original')
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')
        self.assertEqual((self.profile / 'configuration/foo_ui_std.dll.cfg').read_bytes(), b'themed-default-layout')
        self.assertTrue((self.profile / 'user-components-x64/foo_ui_columns').exists())
        self.assertEqual(json.loads((self.profile / 'smartshuffle/integration-mode.json').read_text())['mode'], 'themed')

    def test_running_marker_rejection_leaves_profile_untouched(self):
        # Simulates the platform offline guard refusing a live profile, without a player.
        with patch('profile_style._offline_profile', side_effect=ValueError('running')):
            with self.assertRaises(ValueError):
                switch.prepare(self.root, self.backup)
        self.assertFalse((self.profile / 'smartshuffle/integration-mode.json').exists())
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')

    @unittest.skipUnless(os.name == 'nt', 'Windows marker lock semantics')
    def test_real_exclusive_running_marker_blocks_switch_then_stale_marker_allows_it(self):
        import ctypes
        from ctypes import wintypes
        switch.prepare(self.root, self.backup)
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        create_file = kernel32.CreateFileW
        create_file.argtypes = (wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE)
        create_file.restype = wintypes.HANDLE
        close_handle = kernel32.CloseHandle
        close_handle.argtypes = (wintypes.HANDLE,)
        close_handle.restype = wintypes.BOOL
        marker = self.profile / 'running'
        marker.touch()
        handle = create_file(str(marker), 0x80000000, 0, None, 3, 0x80, None)
        self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
        try:
            with self.assertRaises(ValueError):
                switch.switch_mode(self.root, 'original')
            self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')
            self.assertTrue((self.profile / 'user-components-x64/foo_ui_columns').exists())
        finally:
            self.assertTrue(close_handle(handle))
        self.assertEqual(switch.switch_mode(self.root, 'original'), 'original')
        self.assertTrue(marker.exists())

    def test_rejects_existing_switch_lock_and_invalid_mode_flag(self):
        switch.prepare(self.root, self.backup)
        lock = self.profile / 'smartshuffle/integration-switch.lock'
        write(lock, b'other-switch')
        with self.assertRaises(ValueError):
            switch.switch_mode(self.root, 'original')
        self.assertEqual(lock.read_bytes(), b'other-switch')
        lock.unlink()
        flag = self.profile / 'smartshuffle/integration-mode.json'
        flag.write_text('{"version":1,"mode":"invalid"}')
        with self.assertRaises(ValueError):
            switch.switch_mode(self.root, 'original')
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')

    def test_rejects_symlinked_appearance_without_touching_outside_file(self):
        switch.prepare(self.root, self.backup)
        outside = self.root.parent / 'outside.cfg'
        outside.write_bytes(b'outside')
        cfg = self.profile / 'configuration/foo_ui_std.dll.cfg'
        cfg.unlink()
        try:
            cfg.symlink_to(outside)
        except OSError as exc:
            self.skipTest('Symlink creation unavailable: ' + str(exc))
        with self.assertRaises(ValueError):
            switch.switch_mode(self.root, 'original')
        self.assertEqual(outside.read_bytes(), b'outside')
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')

    def test_missing_branch_file_rejects_before_current_branch_is_snapshotted(self):
        switch.prepare(self.root, self.backup)
        (self.profile / 'smartshuffle/integration/original/files/configuration/foo_ui_std.dll.cfg').unlink()
        with self.assertRaises(ValueError):
            switch.switch_mode(self.root, 'original')
        self.assertFalse((self.profile / 'smartshuffle/integration/themed').exists())
        self.assertEqual(self.rows()['configBlobs'][UI_KEY], b'themed')

    @unittest.skipUnless(os.name == 'nt' and shutil.which('powershell'), 'Windows PowerShell wrapper')
    def test_hidden_wrapper_records_success_and_backend_failure_without_launching_player(self):
        control = self.root.parent / 'control-fixture'
        control.mkdir()
        wrapper = control / 'switch-mode.ps1'
        shutil.copy2(Path(__file__).resolve().parents[1] / 'scripts/switch-mode.ps1', wrapper)
        # Driver replaces process cmdlets: the fake .exe fixture is never executed.
        driver = control / 'driver.ps1'
        driver.write_text('param([string]$Wrapper,[string]$FoobarRoot)\nfunction Get-Process {}\nfunction Start-Process {}\n& $Wrapper -FoobarRoot $FoobarRoot -Mode toggle\n', encoding='utf-8')
        backend = control / 'switch_mode.py'
        backend.write_text("print('original')\n", encoding='utf-8')
        command = ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(driver), '-Wrapper', str(wrapper), '-FoobarRoot', str(self.root)]
        success = subprocess.run(command, capture_output=True, timeout=20)
        self.assertEqual(success.returncode, 0, success.stderr.decode(errors='replace'))
        result_path = self.profile / 'smartshuffle/integration-switch-result.json'
        self.assertTrue(result_path.exists(), 'Hidden wrapper must persist switch result')
        result = json.loads(result_path.read_text(encoding='utf-8-sig'))
        self.assertIs(result['ok'], True)
        self.assertEqual(result['mode'], 'original')
        self.assertIsNone(result['error'])
        self.assertTrue(result['timestamp'])
        write(self.profile / 'smartshuffle/integration-mode.json', b'{"version":1,"mode":"themed"}')
        backend.write_text("import sys\nprint('fixture backend failure', file=sys.stderr)\nsys.exit(7)\n", encoding='utf-8')
        failure = subprocess.run(command, capture_output=True, timeout=20)
        self.assertNotEqual(failure.returncode, 0)
        result = json.loads(result_path.read_text(encoding='utf-8-sig'))
        self.assertIs(result['ok'], False)
        self.assertEqual(result['mode'], 'themed')
        self.assertIn('fixture backend failure', result['error'])


if __name__ == '__main__':
    unittest.main()
