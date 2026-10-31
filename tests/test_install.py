import json
from contextlib import closing
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from install import UI_COLUMNS, UI_KEY, UI_MODULES, UI_MODULES_KEY, safe_child, select_interface, restore


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


if __name__ == "__main__":
    unittest.main()
