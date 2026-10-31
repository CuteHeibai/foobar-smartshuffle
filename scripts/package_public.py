"""Public assets include licensed UI Wizard; Columns UI/JSplitter/ESLyric remain dependencies."""
import hashlib
from importlib import metadata
import json
from pathlib import Path
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist/public-release"
VERSION = "1.0.1"


def copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    else:
        shutil.copy2(source, destination)


def main():
    component = ROOT / "build/foo_smartshuffle.dll"
    runtime = ROOT / "build/analyzer/smartshuffle-analyzer"
    assert component.is_file() and (runtime / "smartshuffle-analyzer.exe").is_file(), "Build component and analyzer first"
    assert OUTPUT.resolve().is_relative_to((ROOT / "dist").resolve())
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    bundle = OUTPUT / f"foobar-smartshuffle-{VERSION}"
    payload = bundle / "payload"
    copy(component, payload / "components/foo_smartshuffle/foo_smartshuffle.dll")
    copy(ROOT / "vendor/verdant-foobar2000-theme-master/components/foo_ui_wizard", payload / "components/foo_ui_wizard")
    copy(runtime, payload / "runtime/smartshuffle-analyzer")
    copy(ROOT / "theme/verdant", payload / "theme/verdant")
    copy(ROOT / "theme/columns-ui-layout.cfg",
         payload / "config/foo_ui_columns.dll.cfg")
    for name in ("README.md", "LICENSE", "THIRD-PARTY-NOTICES.md", "licenses"):
        copy(ROOT / name, bundle / name)
    for name in ("install-public.ps1", "install.ps1", "install.py", "profile_style.py"):
        copy(ROOT / "scripts" / name, bundle / "scripts" / name)
    copy(ROOT / "docs", bundle / "docs")
    copy(Path(sys.base_prefix) / "LICENSE.txt", bundle / "licenses/analyzer/CPython-LICENSE.txt")
    distributions = []
    for distribution in metadata.distributions():
        name = distribution.metadata["Name"]
        version = distribution.version
        entry = {"name": name, "version": version,
                 "license": distribution.metadata.get("License-Expression") or distribution.metadata.get("License", ""),
                 "project_urls": distribution.metadata.get_all("Project-URL", [])}
        distributions.append(entry)
        for path in distribution.files or []:
            # Retain original relative names, including license directories and METADATA.
            if ".dist-info/" not in str(path).replace("\\", "/"):
                continue
            filename = Path(path).name.lower()
            if filename != "metadata" and not any(word in filename for word in ("license", "copying", "notice", "authors")):
                continue
            source = Path(distribution.locate_file(path))
            if source.is_file():
                relative = Path(str(path).replace("\\", "/"))
                assert not relative.is_absolute() and ".." not in relative.parts
                copy(source, bundle / "licenses/analyzer" / relative)
    (bundle / "licenses/analyzer/dependencies.json").write_text(
        json.dumps(sorted(distributions, key=lambda d: d["name"].lower()), indent=2), encoding="utf-8")
    asset = OUTPUT / f"foobar-smartshuffle-desktop-{VERSION}.zip"
    with zipfile.ZipFile(asset, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(bundle.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(OUTPUT).as_posix())
    native = OUTPUT / "foo_smartshuffle.fb2k-component"
    with zipfile.ZipFile(native, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(component, "foo_smartshuffle.dll")
        for name in ("LICENSE", "THIRD-PARTY-NOTICES.md"):
            archive.write(ROOT / name, name)
        for path in sorted((ROOT / "licenses").rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(ROOT).as_posix())
    assets = (asset, native)
    (OUTPUT / "SHA256SUMS.txt").write_text("".join(
        f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in assets), encoding="utf-8")
    print(json.dumps({"assets": [{"name": p.name, "bytes": p.stat().st_size} for p in assets],
                      "dependency_notices": len(distributions)}, indent=2))


if __name__ == "__main__":
    main()
