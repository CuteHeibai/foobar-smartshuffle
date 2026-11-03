import json
from contextlib import closing
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from install import UI_COLUMNS, UI_KEY, UI_MODULES, UI_MODULES_KEY, safe_child, select_interface, restore, install
import switch_mode
from test_switch_mode import database, write
from test_profile_style import container


class InstallTests(unittest.TestCase):
    def test_only_interface_selection_changes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "config.sqlite"
            with closing(sqlite3.connect(p)) as c, c:
                c.execute("CREATE TABLE configBlobs(name TEXT PRIMARY KEY,value BLOB)")
                c.execute("INSERT INTO configBlobs VALUES('audio output',X'010203')")
            select_interface(p)
            with closing(sqlite3.connect(p)) as c, c:
                self.assertEqual(c.execute("SELECT value FROM configBlobs WHERE name=?", (UI_KEY,)).fetchone()[0], UI_COLUMNS)
                self.assertEqual(c.execute("SELECT value FROM configBlobs WHERE name=?", (UI_MODULES_KEY,)).fetchone()[0], UI_MODULES)
                self.assertEqual(c.execute("SELECT value FROM configBlobs WHERE name='audio output'").fetchone()[0], b"\x01\x02\x03")

    def test_paths_cannot_escape_target(self):
        with tempfile.TemporaryDirectory() as d:
            for value in ["../outside", ".", "a/../../outside"]:
                with self.assertRaises(ValueError):
                    safe_child(d, value)

    def test_restore_existing_and_new_paths_without_touching_other_data(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "player"
            backup = Path(d) / "backup"
            (root / "profile").mkdir(parents=True)
            (backup / "original/profile").mkdir(parents=True)
            (root / "profile/existing").write_text("changed")
            (root / "profile/new").write_text("added")
            (root / "profile/user-data").write_text("keep")
            (backup / "original/profile/existing").write_text("original")
            (backup / "manifest.json").write_text(json.dumps({"target": str(root), "entries": [{"path": "profile/existing", "existed": True}, {"path": "profile/new", "existed": False}]}))
            restore(backup)
            self.assertEqual((root / "profile/existing").read_text(), "original")
            self.assertFalse((root / "profile/new").exists())
            self.assertEqual((root / "profile/user-data").read_text(), "keep")


class FullInstallRestoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / 'player'
        self.profile = self.root / 'profile'
        self.payload = self.base / 'payload'
        write(self.root / 'foobar2000.exe', b'never execute this fixture')
        write(self.root / 'portable_mode_enabled', b'')
        database(self.profile / 'config.sqlite', 'original')
        write(self.profile / 'configuration/foo_ui_std.dll.cfg', b'original layout')
        write(self.profile / 'user-components-x64/foo_uie_jsplitter/foo_uie_jsplitter.dll', b'original jsplitter')
        for name in ['components/foo_smartshuffle/foo_smartshuffle.dll', 'runtime/analyzer.exe', 'theme/verdant/main.js', 'components/foo_ui_columns/foo_ui_columns.dll', 'components/foo_ui_wizard/foo_ui_wizard.dll']:
            write(self.payload / name, b'version1')
        write(self.payload / 'config/foo_ui_columns.dll.cfg', container())
        for name in ['switch_mode.py', 'profile_style.py', 'switch-mode.ps1']:
            source = Path(__file__).resolve().parents[1] / 'scripts' / name
            write(self.payload / 'control' / name, source.read_bytes())

    def test_personal_library_survives_upgrade_and_is_restored_with_the_profile(self):
        data = self.profile / 'smartshuffle/personal.json'
        before = b'{"version":1,"favorites":["kept"]}'
        write(data, before)
        backup = install(self.payload, self.root, with_eslyric=False)
        self.assertEqual(data.read_bytes(), before)
        self.assertEqual((backup / 'original/profile/smartshuffle/personal.json').read_bytes(), before)
        write(data, b'{"version":1,"favorites":["changed"]}')
        restore(backup)
        self.assertEqual(data.read_bytes(), before)

    def test_initial_restore_removes_generated_integration_state(self):
        backup = install(self.payload, self.root, with_eslyric=False)
        self.assertTrue((self.profile / 'smartshuffle/integration/baseline.json').exists())
        restore(backup)
        self.assertFalse((self.profile / 'smartshuffle/integration').exists())
        self.assertFalse((self.profile / 'smartshuffle/integration-mode.json').exists())
        self.assertFalse((self.profile / 'user-components-x64/foo_smartshuffle').exists())
        self.assertEqual((self.profile / 'configuration/foo_ui_std.dll.cfg').read_bytes(), b'original layout')

    def test_updater_helper_is_backed_up_and_download_cache_is_not_snapshotted(self):
        helper = self.profile / 'smartshuffle/update-helper/update_apply.py'
        write(helper, b'old helper')
        write(self.payload / 'update-helper/update_apply.py', b'new helper')
        cached = self.profile / 'smartshuffle/updates/job/package.zip'
        write(cached, b'downloaded update')
        backup = install(self.payload, self.root, with_eslyric=False)
        self.assertEqual(helper.read_bytes(), b'new helper')
        self.assertFalse((backup / 'profile-snapshot/smartshuffle/updates').exists())
        self.assertEqual(cached.read_bytes(), b'downloaded update')
        restore(backup)
        self.assertEqual(helper.read_bytes(), b'old helper')
        self.assertEqual(cached.read_bytes(), b'downloaded update')

    def test_original_mode_upgrade_standalone_restore_returns_original_ui_and_old_plugin(self):
        install(self.payload, self.root, with_eslyric=False)
        switch_mode.switch_mode(self.root, 'original')
        write(self.profile / 'configuration/foo_ui_std.dll.cfg', b'customized original before upgrade')
        baseline = (self.profile / 'smartshuffle/integration/baseline.json').read_bytes()
        write(self.payload / 'components/foo_smartshuffle/foo_smartshuffle.dll', b'version2')
        backup = install(self.payload, self.root, with_eslyric=False)
        self.assertEqual(json.loads((self.profile / 'smartshuffle/integration-mode.json').read_text())['mode'], 'original')
        self.assertEqual((self.profile / 'user-components-x64/foo_smartshuffle/foo_smartshuffle.dll').read_bytes(), b'version2')
        write(self.profile / 'configuration/foo_ui_std.dll.cfg', b'changed after upgrade')
        # Standalone backup command must work without the source/package scripts.
        for name in ['switch_mode.py', 'profile_style.py']:
            self.assertTrue((backup / name).is_file(), 'Standalone restore requires ' + name)
        result = subprocess.run([sys.executable, str(backup / 'install.py'), '--restore', str(backup)], cwd=self.base, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        self.assertEqual(json.loads((self.profile / 'smartshuffle/integration-mode.json').read_text())['mode'], 'original')
        self.assertEqual((self.profile / 'configuration/foo_ui_std.dll.cfg').read_bytes(), b'customized original before upgrade')
        self.assertFalse((self.profile / 'user-components-x64/foo_ui_columns').exists())
        self.assertFalse((self.profile / 'user-components-x64/foo_ui_wizard').exists())
        self.assertEqual((self.profile / 'user-components-x64/foo_smartshuffle/foo_smartshuffle.dll').read_bytes(), b'version1')
        self.assertEqual((self.profile / 'smartshuffle/integration/baseline.json').read_bytes(), baseline)
        with closing(sqlite3.connect(self.profile / 'config.sqlite')) as c:
            self.assertEqual(c.execute('SELECT value FROM configBlobs WHERE name=?', (UI_KEY,)).fetchone()[0], b'original')
        # Restoring while disabled must also retain the complete old themed
        # branch; components absent in original mode were already present when
        # the upgrade backup was captured and are not installation mappings.
        self.assertEqual(switch_mode.switch_mode(self.root, 'themed'), 'themed')
        self.assertTrue((self.profile / 'user-components-x64/foo_ui_columns/foo_ui_columns.dll').is_file())
        self.assertTrue((self.profile / 'user-components-x64/foo_ui_wizard/foo_ui_wizard.dll').is_file())
        self.assertEqual((self.profile / 'user-components-x64/foo_ui_columns/foo_ui_columns.dll').read_bytes(), b'version1')
        self.assertEqual((self.profile / 'user-components-x64/foo_ui_wizard/foo_ui_wizard.dll').read_bytes(), b'version1')
        self.assertEqual((self.profile / 'verdant/main.js').read_bytes(), b'version1')

    def test_failed_original_mode_upgrade_restores_original_ui_and_keeps_baseline(self):
        install(self.payload, self.root, with_eslyric=False)
        switch_mode.switch_mode(self.root, 'original')
        baseline = (self.profile / 'smartshuffle/integration/baseline.json').read_bytes()
        with patch('profile_style.apply_profile', side_effect=ValueError('fixture migration failure')):
            with self.assertRaises(ValueError):
                install(self.payload, self.root, with_eslyric=False)
        self.assertEqual(json.loads((self.profile / 'smartshuffle/integration-mode.json').read_text())['mode'], 'original')
        self.assertFalse((self.profile / 'user-components-x64/foo_ui_columns').exists())
        self.assertEqual((self.profile / 'configuration/foo_ui_std.dll.cfg').read_bytes(), b'original layout')
        self.assertEqual((self.profile / 'smartshuffle/integration/baseline.json').read_bytes(), baseline)


@unittest.skipUnless(os.name == 'nt' and shutil.which('powershell'), 'Windows public installer')
class PublicInstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / 'player'
        self.profile = self.root / 'profile'
        write(self.root / 'foobar2000.exe', b'never execute this fixture')
        write(self.root / 'portable_mode_enabled', b'')
        backup = self.root / 'smartshuffle-backups/001'
        database(backup / 'profile-snapshot/config.sqlite', 'original')
        write(backup / 'manifest.json', json.dumps({'version': 1, 'target': str(self.root), 'entries': [{'path': 'profile/user-components-x64/foo_smartshuffle', 'existed': False}]}).encode())
        database(self.profile / 'config.sqlite', 'themed')
        write(self.profile / 'user-components-x64/foo_ui_columns/foo_ui_columns.dll', b'columns')
        write(self.profile / 'user-components-x64/foo_uie_jsplitter/foo_uie_jsplitter.dll', b'jsplitter')
        switch_mode.prepare(self.root, backup)
        switch_mode.switch_mode(self.root, 'original')
        self.scripts = self.base / 'package/scripts'
        self.scripts.mkdir(parents=True)
        source = Path(__file__).resolve().parents[1] / 'scripts'
        for name in ['install-public.ps1', 'switch_mode.py', 'profile_style.py']:
            shutil.copy2(source / name, self.scripts / name)
        # Delegation fixture: no host process, installation or UI is touched.
        (self.scripts / 'install.ps1').write_text("param([string]$FoobarRoot,[switch]$SkipESLyric,[switch]$NoLaunch,[string]$Edition)\n[IO.File]::WriteAllText((Join-Path $FoobarRoot 'delegated'),'ok')\n")

    def run_public(self):
        return subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(self.scripts / 'install-public.ps1'), '-FoobarRoot', str(self.root), '-Edition', 'full', '-NoLaunch'], capture_output=True, timeout=20)

    def test_original_mode_upgrade_accepts_valid_saved_columns_component(self):
        self.assertFalse((self.profile / 'user-components-x64/foo_ui_columns').exists())
        result = self.run_public()
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        self.assertEqual((self.root / 'delegated').read_text(), 'ok')
        self.assertEqual(json.loads((self.profile / 'smartshuffle/integration-mode.json').read_text())['mode'], 'original')

    def test_original_mode_upgrade_still_requires_active_jsplitter(self):
        (self.profile / 'user-components-x64/foo_uie_jsplitter/foo_uie_jsplitter.dll').unlink()
        self.assertNotEqual(self.run_public().returncode, 0)
        self.assertFalse((self.root / 'delegated').exists())

    def test_saved_columns_with_invalid_branch_or_baseline_is_rejected(self):
        manifest_path = self.profile / 'smartshuffle/integration/themed/manifest.json'
        good = manifest_path.read_text()
        manifest = json.loads(good)
        manifest['files']['../../outside'] = True
        manifest_path.write_text(json.dumps(manifest))
        self.assertNotEqual(self.run_public().returncode, 0)
        self.assertFalse((self.root / 'delegated').exists())
        manifest_path.write_text(good)
        baseline_path = self.profile / 'smartshuffle/integration/baseline.json'
        baseline = json.loads(baseline_path.read_text())
        baseline['target'] = str(self.base / 'wrong-target')
        baseline_path.write_text(json.dumps(baseline))
        self.assertNotEqual(self.run_public().returncode, 0)
        self.assertFalse((self.root / 'delegated').exists())

    def test_local_package_contains_all_control_dependencies(self):
        repo = self.base / 'local-package'
        source = Path(__file__).resolve().parents[1]
        for name in ['src', 'analyzer', 'scripts', 'tests', 'docs', 'theme/verdant', 'assets/fonts']:
            (repo / name).mkdir(parents=True)
            write(repo / name / 'fixture.txt', b'fixture')
        for name in ['AGENTS.md', 'foo_smartshuffle.vcxproj', 'fixture.vcxproj', 'README.md', '.gitignore']:
            write(repo / name, b'fixture')
        for name in ['package.ps1', 'switch-mode.ps1', 'switch_mode.py', 'profile_style.py', 'install.py', 'update_apply.py', 'update-and-restart.ps1']:
            shutil.copy2(source / 'scripts' / name, repo / 'scripts' / name)
        for name in ['build/foo_smartshuffle.dll', 'build/eslyric/foo_uie_eslyric.dll', 'build/analyzer/smartshuffle-analyzer/smartshuffle-analyzer.exe', 'vendor/verdant-foobar2000-theme-master/components/foo_ui_columns/foo_ui_columns.dll', 'vendor/verdant-foobar2000-theme-master/components/foo_ui_wizard/foo_ui_wizard.dll', 'vendor/verdant-foobar2000-theme-master/dist-config/foo_ui_columns.dll.cfg']:
            write(repo / name, b'never execute fixture')
        result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(repo / 'scripts/package.ps1')], capture_output=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        for name in ['switch-mode.ps1', 'switch_mode.py', 'profile_style.py']:
            self.assertTrue((repo / 'dist/payload/control' / name).is_file())
            self.assertEqual((repo / 'dist/payload/control' / name).read_bytes(), (source / 'scripts' / name).read_bytes())
            self.assertTrue((repo / 'dist/foobar-smartshuffle-local/payload/control' / name).is_file())


if __name__ == "__main__":
    unittest.main()
