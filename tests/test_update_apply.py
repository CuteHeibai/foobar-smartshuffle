"""Offline fixture tests; dummy player images are never executed."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'player'
        self.job = self.root / 'profile/smartshuffle/updates/test-job'
        self.job.mkdir(parents=True)
        (self.root / 'foobar2000.exe').write_bytes(b'never execute this fixture')
        (self.root / 'portable_mode_enabled').touch()
        (self.root / 'profile/smartshuffle/installation.json').write_text('{"edition":"core"}')
        self.prefix = 'foobar-smartshuffle-core-1.0.9/'
        self.files = {'edition.json': b'{"edition":"core"}',
                      'payload/components/foo_smartshuffle/foo_smartshuffle.dll': b'new native',
                      'payload/runtime/smartshuffle-analyzer/smartshuffle-analyzer.exe': b'new analyzer'}
        self.make_zip()

    def make_zip(self, extra=None):
        with zipfile.ZipFile(self.job / 'package.zip', 'w') as z:
            for name, value in self.files.items():
                z.writestr(self.prefix + name, value)
            for name, value in (extra or {}).items():
                z.writestr(name, value)
        raw = (self.job / 'package.zip').read_bytes()
        self.document = {'version': 1, 'target': str(self.root), 'pid': 0, 'current': '1.0.8', 'edition': 'core',
                         'release': {'version': '1.0.9', 'tag': 'v1.0.9', 'asset': 'foobar-smartshuffle-core-1.0.9.zip',
                                     'url': 'https://github.com/CuteHeibai/foobar-smartshuffle/releases/download/v1.0.9/foobar-smartshuffle-core-1.0.9.zip',
                                     'page': 'https://github.com/CuteHeibai/foobar-smartshuffle/releases/tag/v1.0.9',
                                     'sha256': hashlib.sha256(raw).hexdigest(), 'size': len(raw)}}
        self.save_job()

    def save_job(self):
        (self.job / 'job.json').write_text(json.dumps(self.document))

    def backend(self):
        self.assertTrue((SCRIPTS / 'update_apply.py').is_file(), 'Offline update backend is missing')
        import update_apply
        return update_apply

    def test_prepares_real_zip_then_installs_and_preserves_user_state(self):
        backend = self.backend()
        user = self.root / 'profile/smartshuffle/store.json'
        user.write_bytes(b'personal state')
        backend.prepare(self.root, self.job)
        prepared = json.loads((self.job / 'prepared.json').read_text())
        self.assertEqual(prepared['sha256'], self.document['release']['sha256'])
        result = backend.apply(self.root, self.job)
        self.assertTrue(result['ok'])
        self.assertTrue((Path(result['backup']) / 'manifest.json').is_file())
        self.assertEqual((self.root / 'profile/user-components-x64/foo_smartshuffle/foo_smartshuffle.dll').read_bytes(), b'new native')
        self.assertEqual(user.read_bytes(), b'personal state')
        self.assertEqual(json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())['version'], '1.0.9')

    def test_rejects_hash_wrong_edition_and_unofficial_url_before_staging(self):
        backend = self.backend()
        for key, value in [('sha256', '0' * 64), ('url', 'https://evil.invalid/package.zip')]:
            original = self.document['release'][key]
            self.document['release'][key] = value
            self.save_job()
            with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
            self.document['release'][key] = original
        self.save_job()
        (self.root / 'profile/smartshuffle/installation.json').write_text('{"edition":"full"}')
        with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
        self.assertFalse((self.job / 'staged').exists())

    def test_standalone_without_installation_marker_infers_core_and_installs(self):
        backend = self.backend()
        marker = self.root / 'profile/smartshuffle/installation.json'
        marker.unlink()
        try:
            backend.prepare(self.root, self.job)
        except FileNotFoundError as error:
            self.fail('Standalone core update must not require installation.json: ' + str(error))
        report = backend.apply(self.root, self.job)
        self.assertTrue(report['ok'])
        self.assertEqual(json.loads(marker.read_text()), {'edition': 'core'})

    def test_standalone_theme_without_marker_infers_full_and_rejects_core_package(self):
        backend = self.backend()
        (self.root / 'profile/smartshuffle/installation.json').unlink()
        theme = self.root / 'profile/verdant/main.js'
        theme.parent.mkdir(parents=True)
        theme.write_bytes(b'existing theme')
        try:
            with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
        except FileNotFoundError as error:
            self.fail('Standalone themed update must infer edition before package matching: ' + str(error))
        self.prefix = 'foobar-smartshuffle-full-1.0.9/'
        self.files['edition.json'] = b'{"edition":"full"}'
        self.files['payload/theme/verdant/main.js'] = b'new theme'
        self.files['payload/config/foo_ui_columns.dll.cfg'] = b'new layout'
        self.files['payload/components/foo_ui_wizard/foo_ui_wizard.dll'] = b'new wizard'
        self.make_zip()
        self.document['edition'] = 'full'
        self.document['release']['asset'] = 'foobar-smartshuffle-full-1.0.9.zip'
        self.document['release']['url'] = 'https://github.com/CuteHeibai/foobar-smartshuffle/releases/download/v1.0.9/foobar-smartshuffle-full-1.0.9.zip'
        self.save_job()
        try:
            prepared = backend.prepare(self.root, self.job)
        except FileNotFoundError as error:
            self.fail('Standalone full update must not require installation.json: ' + str(error))
        self.assertEqual(prepared['edition'], 'full')

    def test_existing_invalid_installation_marker_never_falls_back_to_inference(self):
        backend = self.backend()
        marker = self.root / 'profile/smartshuffle/installation.json'
        for value in ['{}', '{"edition":"unknown"}', 'not JSON']:
            with self.subTest(value=value):
                marker.write_text(value)
                with self.assertRaises(ValueError): backend.prepare(self.root, self.job)

    def test_rejects_traversal_ads_device_duplicate_and_foreign_prefix(self):
        backend = self.backend()
        for name in ['../escaped', '/absolute', self.prefix + 'payload/../../escaped', self.prefix + 'payload/NUL.txt',
                     self.prefix + 'payload/file:stream', self.prefix + 'EDITION.JSON', 'other/file', self.prefix + 'payload/a./file']:
            with self.subTest(name=name):
                self.make_zip({name: b'bad'})
                with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
                self.assertFalse((self.job / 'staged').exists())

    def test_rejects_zip_link_and_malformed_archive(self):
        backend = self.backend()
        with zipfile.ZipFile(self.job / 'package.zip', 'a') as z:
            entry = zipfile.ZipInfo(self.prefix + 'link')
            entry.create_system = 3
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(entry, '../../outside')
        self.rehash()
        with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
        (self.job / 'package.zip').write_bytes(b'not a zip')
        self.rehash()
        with self.assertRaises(ValueError): backend.prepare(self.root, self.job)

    def rehash(self):
        raw = (self.job / 'package.zip').read_bytes()
        self.document['release']['sha256'] = hashlib.sha256(raw).hexdigest()
        self.document['release']['size'] = len(raw)
        self.save_job()

    def test_staged_tampering_is_rejected_without_installer_side_effect(self):
        backend = self.backend()
        backend.prepare(self.root, self.job)
        (self.job / 'staged' / self.prefix / 'payload/components/foo_smartshuffle/foo_smartshuffle.dll').write_bytes(b'tampered')
        with self.assertRaises(ValueError): backend.apply(self.root, self.job)
        self.assertFalse((self.root / 'smartshuffle-backups').exists())

    def test_package_changed_after_prepare_is_rejected(self):
        backend = self.backend()
        backend.prepare(self.root, self.job)
        self.make_zip({self.prefix + 'extra.txt': b'changed'})
        with self.assertRaises(ValueError): backend.apply(self.root, self.job)

    def test_prepare_recovers_interrupted_manifest_commit_without_reextracting(self):
        backend = self.backend()
        backend.prepare(self.root, self.job)
        native = self.job / 'staged' / self.prefix / 'payload/components/foo_smartshuffle/foo_smartshuffle.dll'
        previous = native.stat().st_mtime_ns
        (self.job / 'prepared.json').unlink()
        backend.prepare(self.root, self.job)
        self.assertTrue((self.job / 'prepared.json').is_file())
        self.assertEqual(native.stat().st_mtime_ns, previous)

    def test_wrong_packaged_edition_missing_runtime_and_unpacked_limit_are_rejected(self):
        backend = self.backend()
        self.files['edition.json'] = b'{"edition":"full"}'
        self.make_zip()
        with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
        self.files['edition.json'] = b'{"edition":"core"}'
        analyzer = self.files.pop('payload/runtime/smartshuffle-analyzer/smartshuffle-analyzer.exe')
        self.make_zip()
        with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
        self.files['payload/runtime/smartshuffle-analyzer/smartshuffle-analyzer.exe'] = analyzer
        self.make_zip()
        with patch.object(backend, 'MAX_UNPACKED', 4):
            with self.assertRaises(ValueError): backend.prepare(self.root, self.job)

    def test_prepared_manifest_tampering_cannot_authorize_changed_staged_content(self):
        backend = self.backend()
        backend.prepare(self.root, self.job)
        relative = self.prefix + 'payload/components/foo_smartshuffle/foo_smartshuffle.dll'
        modified = b'substitute'
        (self.job / 'staged' / relative).write_bytes(modified)
        prepared = json.loads((self.job / 'prepared.json').read_text())
        prepared['files'][relative] = {'sha256': hashlib.sha256(modified).hexdigest(), 'size': len(modified)}
        (self.job / 'prepared.json').write_text(json.dumps(prepared))
        with self.assertRaises(ValueError): backend.apply(self.root, self.job)

    def test_linked_job_or_destination_is_rejected(self):
        backend = self.backend()
        outside = self.root.parent / 'outside'
        outside.mkdir()
        link = self.root / 'profile/user-components-x64'
        try:
            link.symlink_to(outside, target_is_directory=True)
        except OSError as error:
            if os.name != 'nt':
                self.skipTest('Symlink creation is unavailable: ' + str(error))
            junction = subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(outside)], capture_output=True)
            if junction.returncode:
                self.skipTest('Reparse fixture creation is unavailable')
        with self.assertRaises(ValueError): backend.prepare(self.root, self.job)
        self.assertEqual(list(outside.iterdir()), [])

    def test_job_outside_owned_directory_is_rejected(self):
        backend = self.backend()
        outside = self.root / 'unowned'
        shutil.copytree(self.job, outside)
        with self.assertRaises(ValueError): backend.prepare(self.root, outside)

    def test_installer_failure_restores_previous_component_and_records_backup(self):
        backend = self.backend()
        import install
        old = self.root / 'profile/user-components-x64/foo_smartshuffle/foo_smartshuffle.dll'
        old.parent.mkdir(parents=True)
        old.write_bytes(b'old native')
        backend.prepare(self.root, self.job)
        original_copy = install.copy
        def fail_on_runtime(source, destination):
            if str(source).endswith('runtime') and 'staged' in str(source): raise OSError('fixture install failure')
            return original_copy(source, destination)
        with patch('install.copy', side_effect=fail_on_runtime):
            with self.assertRaises(OSError): backend.apply(self.root, self.job)
        self.assertEqual(old.read_bytes(), b'old native')
        result = json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())
        self.assertFalse(result['ok'])
        self.assertTrue(Path(result['backup']).is_dir())
        self.assertTrue((self.job / 'package.zip').is_file())

    @unittest.skipUnless(os.name == 'nt', 'Windows file sharing lock')
    def test_active_image_lock_prevents_apply(self):
        import ctypes
        from ctypes import wintypes
        backend = self.backend()
        backend.prepare(self.root, self.job)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateFileW.restype = wintypes.HANDLE
        handle = kernel.CreateFileW(str(self.root / 'foobar2000.exe'), 0x80000000, 0, None, 3, 0, None)
        self.assertNotEqual(handle, wintypes.HANDLE(-1).value)
        try:
            with self.assertRaises((ValueError, OSError)): backend.apply(self.root, self.job)
        finally: kernel.CloseHandle(wintypes.HANDLE(handle))


@unittest.skipUnless(os.name == 'nt' and shutil.which('powershell'), 'Windows launcher fixture')
class LauncherTests(UpdateTests):
    # Inherit only fixture construction, not the backend test cases.
    def run_launcher(self, mode='ok'):
        self.assertTrue((SCRIPTS / 'update-and-restart.ps1').is_file(), 'Update launcher is missing')
        self.document['pid'] = 424242
        self.save_job()
        helper = self.job / 'helper'
        helper.mkdir(exist_ok=True)
        for name in ['update-and-restart.ps1', 'update_apply.py', 'install.py', 'switch_mode.py', 'profile_style.py']:
            shutil.copy2(SCRIPTS / name, helper / name)
        # Every process-control command is intercepted; no real foobar image runs.
        harness = self.root.parent / 'harness.ps1'
        harness.write_text('''param($Launcher,$Root,$Job,$Python,$Mode)
$global:fixtureAlive=$true
$global:fixtureMode=$Mode
$global:fixtureRoot=$Root
$global:fixtureJob=$Job
$global:fixturePython=$Python
function Get-Command {param($Name,$CommandType,$ErrorAction)
    if($global:fixtureMode -eq 'missing-python'){throw 'fixture Python missing'}
    [pscustomobject]@{Source=$global:fixturePython}
}
function Get-Process {param($Id,$Name,$ErrorAction)
    if($global:fixtureAlive){
        $path=Join-Path $global:fixtureRoot 'foobar2000.exe'
        if($global:fixtureMode -eq 'wrong-parent'){$path=Join-Path $global:fixtureRoot 'different.exe'}
        [pscustomobject]@{Id=424242;Path=$path}
    }
}
function Start-Process {param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,$PassThru,$Wait,$ErrorAction)
    Add-Content -LiteralPath (Join-Path $global:fixtureRoot 'events.txt') -Encoding UTF8 -Value ($FilePath+'|'+($ArgumentList -join ' '))
    if($ArgumentList -contains '/exit' -and $global:fixtureMode -eq 'fast-exit'){$global:fixtureAlive=$false}
    if($ArgumentList -notcontains '/exit' -and $global:fixtureMode -eq 'restart-fails'){throw 'fixture restart failure'}
}
function Wait-Process {param($Id,$Timeout,$ErrorAction)
    if(-not $global:fixtureAlive){throw 'No process found with the requested identifier'}
    if($global:fixtureMode -eq 'timeout'){throw 'fixture wait timeout'}
    $global:fixtureAlive=$false
    if($global:fixtureMode -eq 'apply-fails'){
        $native=Join-Path $global:fixtureJob 'staged/foobar-smartshuffle-core-1.0.9/payload/components/foo_smartshuffle/foo_smartshuffle.dll'
        [IO.File]::WriteAllText($native,'tampered after closure')
    }
}
& $Launcher -FoobarRoot $Root -Job $Job -ParentPid 424242
''', encoding='utf-8-sig')
        return subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(harness),
                               str(helper / 'update-and-restart.ps1'), str(self.root), str(self.job), sys.executable, mode],
                              capture_output=True, timeout=30)

    def events(self):
        path = self.root / 'events.txt'
        return path.read_text(encoding='utf-8-sig').splitlines() if path.exists() else []

    def test_launcher_prepares_closes_applies_and_restarts_same_target(self):
        process = self.run_launcher()
        self.assertEqual(process.returncode, 0, process.stderr.decode(errors='replace'))
        self.assertEqual(self.events(), [str(self.root / 'foobar2000.exe') + '|/exit', str(self.root / 'foobar2000.exe') + '|/show'])
        self.assertTrue(json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())['ok'])

    def use_utf8_target(self):
        previous_root = self.root
        self.root = self.root.with_name('播放器')
        previous_root.rename(self.root)
        self.job = self.root / 'profile/smartshuffle/updates/test-job'
        self.document['target'] = str(self.root)
        # Native std::ofstream writes real UTF-8 characters without a BOM.
        self.document['release']['description'] = '更新说明'
        def save_utf8_job():
            (self.job / 'job.json').write_text(json.dumps(self.document, ensure_ascii=False), encoding='utf-8')
        self.save_job = save_utf8_job

    def test_launcher_accepts_utf8_job_in_chinese_target_directory(self):
        self.use_utf8_target()
        process = self.run_launcher()
        self.assertEqual(process.returncode, 0, process.stderr.decode(errors='replace'))
        self.assertEqual(self.events(), [str(self.root / 'foobar2000.exe') + '|/exit', str(self.root / 'foobar2000.exe') + '|/show'])
        report = json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text(encoding='utf-8'))
        self.assertTrue(report['ok'])
        self.assertEqual(report['job'], str(self.job))

    def test_launcher_retains_utf8_backup_path_when_restart_fails(self):
        self.use_utf8_target()
        self.assertNotEqual(self.run_launcher('restart-fails').returncode, 0)
        report = json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text(encoding='utf-8'))
        self.assertFalse(report['ok'])
        self.assertEqual(Path(report['backup']).parent, self.root / 'smartshuffle-backups')
        self.assertTrue((Path(report['backup']) / 'manifest.json').is_file())

    def test_launcher_prepare_failure_never_closes_player(self):
        (self.job / 'package.zip').write_bytes(b'bad download')
        self.assertNotEqual(self.run_launcher().returncode, 0)
        self.assertEqual(self.events(), [])
        self.assertFalse(json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())['ok'])

    def test_launcher_normal_fast_exit_applies_when_wait_cannot_find_old_pid(self):
        process = self.run_launcher('fast-exit')
        self.assertEqual(process.returncode, 0, process.stderr.decode(errors='replace'))
        self.assertEqual([v.split('|')[1] for v in self.events()], ['/exit', '/show'])
        self.assertTrue(json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())['ok'])
        self.assertEqual((self.root / 'profile/user-components-x64/foo_smartshuffle/foo_smartshuffle.dll').read_bytes(), b'new native')

    def test_launcher_missing_python_and_wrong_pid_do_not_close_player(self):
        for mode in ['missing-python', 'wrong-parent']:
            with self.subTest(mode=mode):
                self.assertNotEqual(self.run_launcher(mode).returncode, 0)
                self.assertEqual(self.events(), [])
                self.assertFalse(json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())['ok'])

    def test_launcher_apply_failure_still_restarts_and_retains_error(self):
        self.assertNotEqual(self.run_launcher('apply-fails').returncode, 0)
        self.assertEqual([v.split('|')[1] for v in self.events()], ['/exit', '/show'])
        report = json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())
        self.assertFalse(report['ok'])
        self.assertIn('content changed', report['error'])

    def test_launcher_timeout_does_not_apply_or_launch_second_player(self):
        self.assertNotEqual(self.run_launcher('timeout').returncode, 0)
        self.assertEqual([v.split('|')[1] for v in self.events()], ['/exit'])
        self.assertFalse((self.root / 'smartshuffle-backups').exists())

    def test_launcher_restart_failure_changes_success_to_failure(self):
        self.assertNotEqual(self.run_launcher('restart-fails').returncode, 0)
        report = json.loads((self.root / 'profile/smartshuffle/update-result.json').read_text())
        self.assertFalse(report['ok'])
        self.assertIn('restart', report['error'])


# Avoid rerunning the inherited backend cases in this lifecycle fixture class.
for _name in list(UpdateTests.__dict__):
    if _name.startswith('test_'):
        setattr(LauncherTests, _name, None)


if __name__ == '__main__': unittest.main()
