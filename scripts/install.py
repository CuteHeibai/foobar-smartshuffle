"""Backup-aware, local-only payload installer. The PowerShell wrapper closes the target first."""
import argparse
from contextlib import closing
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3

UI_KEY = "cfg_var.094A28DA-C6E8-4392-BAF1-AD0F29E5B303"
UI_COLUMNS = bytes.fromhex("240a2df1a4a8184696596f66de067524")
UI_MODULES_KEY = "cfg_var.AD13B1D4-A6F7-425E-A93B-2A3C7DC37A93"
UI_MODULES = bytes.fromhex("02000000240a2df1a4a8184696596f66de067524dee8bc6e5ca5094e9efea8b6a66d69fd")


def select_interface(database):
    with closing(sqlite3.connect(database, timeout=5)) as connection, connection:
        connection.execute("INSERT OR REPLACE INTO configBlobs(name,value) VALUES(?,?)", (UI_KEY, UI_COLUMNS))
        # This is the same Default UI + Columns UI module inventory as the
        # upstream prepared layout; acknowledge it to avoid the first-run UI picker.
        connection.execute("INSERT OR REPLACE INTO configBlobs(name,value) VALUES(?,?)", (UI_MODULES_KEY, UI_MODULES))


def safe_child(root, relative):
    root = Path(root).resolve()
    child = (root / relative).resolve()
    if not child.is_relative_to(root) or child == root:
        raise ValueError("Invalid install manifest path")
    return child


def copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(source, destination)


def restore(backup):
    backup = Path(backup).resolve()
    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
    root = Path(manifest["target"]).resolve()
    restore_mode = manifest.get('integration_restore_mode')
    if restore_mode not in (None, 'original'):
        raise ValueError('Invalid backed-up integration restore mode')
    if restore_mode == 'original':
        # Standalone backups carry this backend beside install.py. Import before
        # modifying files so missing recovery dependencies fail without mutation.
        from switch_mode import switch_mode
    for entry in reversed(manifest["entries"]):
        target = safe_child(root, entry["path"])
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
        if entry["existed"]:
            copy(safe_child(backup / "original", entry["path"]), target)
    if restore_mode == 'original':
        # The installer temporarily enabled the themed branch before taking this
        # backup. Its saved original branch contains the actual pre-upgrade UI.
        switch_mode(root, 'original')
    return root


def _install(payload, target, with_eslyric=True, edition="full", restore_mode=None):
    if edition not in {"full", "core"}:
        raise ValueError("Unknown edition")
    payload, target = Path(payload).resolve(), Path(target).resolve()
    if not (target / "foobar2000.exe").is_file() or not (target / "portable_mode_enabled").exists():
        raise ValueError("This local installer requires the known portable x64 foobar folder")
    profile = target / "profile"
    existing_layout = profile / "configuration/foo_ui_columns.dll.cfg"
    preserve_layout = (profile / "user-components-x64/foo_smartshuffle/foo_smartshuffle.dll").is_file() and existing_layout.is_file() and b"verdant" in existing_layout.read_bytes().lower()
    mapping = [
        ("components/foo_smartshuffle", "profile/user-components-x64/foo_smartshuffle"),
        ("runtime", "profile/smartshuffle/runtime"),
    ]
    if (payload / "fonts").is_dir():
        mapping.append(("fonts", "profile/smartshuffle/fonts"))
    if (payload / 'update-helper').is_dir():
        mapping.append(('update-helper', 'profile/smartshuffle/update-helper'))
    if edition == "full":
        mapping += [("theme/verdant", "profile/verdant"),
                    ("config/foo_ui_columns.dll.cfg", "profile/configuration/foo_ui_columns.dll.cfg")]
        if (payload / 'control').is_dir():
            mapping.append(('control', 'profile/smartshuffle/control'))
        for component in ("foo_ui_columns", "foo_ui_wizard"):
            if not (profile / f"user-components-x64/{component}/{component}.dll").exists():
                mapping.append((f"components/{component}", f"profile/user-components-x64/{component}"))
        if not (profile / "user-components-x64/foo_uie_jsplitter/foo_uie_jsplitter.dll").exists():
            raise ValueError("Installed JSplitter is required; it is intentionally reused")
        if with_eslyric:
            source = profile / "user-components-x64/foo_uie_eslyric/foo_uie_eslyric.dll"
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            if digest not in {"ac2e2c8fa2a481c8c217ce53d57f2bd8582c771bf75deab888207e43af43c583", "b3b5c5cbe93d0c515a15c4cdb44915bb729d76682a405d86095bed0e31df46df"}:
                raise ValueError("ESLyric changed since investigation; refusing an incompatible binary patch")
            mapping.append(("components/eslyric-warp/foo_uie_eslyric.dll", "profile/user-components-x64/foo_uie_eslyric/foo_uie_eslyric.dll"))
    for source, _ in mapping:
        if not safe_child(payload, source).exists():
            raise FileNotFoundError(source)
    stamp = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y%m%d-%H%M%S-%f")
    backup = target / "smartshuffle-backups" / stamp
    backup.mkdir(parents=True)
    entries = [destination for _, destination in mapping] + ["profile/playlists-v2.0", "profile/smartshuffle/store.json", "profile/smartshuffle/features.json", "profile/smartshuffle/request.json", "profile/smartshuffle/state.json", "profile/smartshuffle/installation.json"]
    if edition == "full":
        entries += ["profile/configuration/foo_uie_eslyric.dll.cfg", "profile/config.sqlite",
                    "profile/smartshuffle/integration", "profile/smartshuffle/integration-mode.json"]
        # Existing themed components are intentionally omitted from install
        # mappings, but restore must materialize their full appearance before
        # switching back to original and saving the restored themed branch.
        from switch_mode import APPEARANCE_PATHS
        entries += ['profile/' + relative for relative in APPEARANCE_PATHS]
    entries = list(dict.fromkeys(entries))
    manifest = {"version": 1, "target": str(target), "entries": []}
    if restore_mode == 'original':
        manifest['integration_restore_mode'] = 'original'
    for relative in entries:
        existing = safe_child(target, relative)
        manifest["entries"].append({"path": relative, "existed": existing.exists()})
        if existing.exists():
            copy(existing, safe_child(backup / "original", relative))
    (backup / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    # A complete profile snapshot is retained separately for manual disaster recovery.
    def snapshot_ignore(directory, names):
        excluded = {name for name in names if name in ('running', 'nobadshutdown', 'scan-sample.wav')}
        if Path(directory) == profile / 'smartshuffle':
            excluded.add('updates')
        return excluded
    shutil.copytree(profile, backup / "profile-snapshot", ignore=snapshot_ignore)
    copy(Path(__file__), backup / "install.py")
    if edition == 'full':
        for filename in ('switch_mode.py', 'profile_style.py'):
            copy(Path(__file__).with_name(filename), backup / filename)
    (backup / "restore.ps1").write_text(
        "$ErrorActionPreference='Stop'\n"
        "$m=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json\n"
        "$exe=Join-Path $m.target 'foobar2000.exe'\n"
        "$running=Get-Process -Name foobar2000 -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $exe}\n"
        "if($running){& $exe /exit; $running | Wait-Process -Timeout 20 -ErrorAction Stop}\n"
        "python (Join-Path $PSScriptRoot 'install.py') --restore $PSScriptRoot\n"
        "if($LASTEXITCODE){throw 'Restore failed'}\n"
        "Start-Process -FilePath $exe\n", encoding="utf-8-sig")
    try:
        for source, destination in mapping:
            if preserve_layout and destination == "profile/configuration/foo_ui_columns.dll.cfg":
                continue
            dst = safe_child(target, destination)
            if dst.is_dir():
                shutil.rmtree(dst)
            copy(safe_child(payload, source), dst)
        (profile / "smartshuffle").mkdir(exist_ok=True)
        (profile / "smartshuffle/installation.json").write_text(json.dumps({"edition": edition}), encoding="utf-8")
        if edition == "full":
            select_interface(profile / "config.sqlite")
            from profile_style import apply_profile
            style_report = apply_profile(profile)
            (backup / "appearance-migration.json").write_text(json.dumps(style_report, ensure_ascii=False, indent=2), encoding="utf-8")
            if (profile / 'smartshuffle/control/switch_mode.py').is_file():
                from switch_mode import prepare
                prepare(target)
    except Exception:
        restore(backup)
        raise
    return backup


def install(payload, target, with_eslyric=True, edition="full"):
    # Upgrade the saved themed branch, then return to an explicitly disabled UI.
    target = Path(target).resolve()
    flag = target / 'profile/smartshuffle/integration-mode.json'
    restore_original = edition == 'full' and flag.is_file() and json.loads(flag.read_text(encoding='utf-8')).get('mode') == 'original'
    if restore_original:
        from switch_mode import switch_mode
        switch_mode(target, 'themed')
    try:
        return _install(payload, target, with_eslyric, edition,
                        restore_mode='original' if restore_original else None)
    finally:
        if restore_original:
            switch_mode(target, 'original')


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", type=Path)
    parser.add_argument("--target", type=Path)
    parser.add_argument("--restore", type=Path)
    parser.add_argument("--skip-eslyric", action="store_true")
    parser.add_argument("--edition", choices=["full", "core"], default="full")
    args = parser.parse_args()
    if args.restore:
        print(restore(args.restore))
    else:
        print(install(args.payload, args.target, not args.skip_eslyric, args.edition))
