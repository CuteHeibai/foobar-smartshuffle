import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from install import install,restore

class CoreInstallTests(unittest.TestCase):
 def test_core_install_preserves_interface_fonts_output_and_plugins_and_restores(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);payload=root/'payload';target=root/'player'
   (target/'profile/configuration').mkdir(parents=True)
   (target/'foobar2000.exe').write_bytes(b'fixture')
   (target/'portable_mode_enabled').touch()
   keep={'profile/config.sqlite':b'unchanged database','profile/configuration/foo_ui_columns.dll.cfg':b'original layout','profile/configuration/foo_uie_eslyric.dll.cfg':b'original font','profile/user-components-x64/other/other.dll':b'other plugin'}
   for name,data in keep.items():
    p=target/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
   for name in ['components/foo_smartshuffle/foo_smartshuffle.dll','runtime/smartshuffle-analyzer/smartshuffle-analyzer.exe','fonts/Inter-Regular.ttf']:
    p=payload/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'new plugin')
   backup=install(payload,target,with_eslyric=False,edition='core')
   self.assertEqual(json.loads((target/'profile/smartshuffle/installation.json').read_text())['edition'],'core')
   for name,data in keep.items():self.assertEqual((target/name).read_bytes(),data)
   self.assertFalse((target/'profile/verdant').exists())
   self.assertFalse((target/'profile/user-components-x64/foo_ui_wizard').exists())
   self.assertTrue((target/'profile/smartshuffle/fonts/Inter-Regular.ttf').exists())
   restore(backup)
   self.assertFalse((target/'profile/user-components-x64/foo_smartshuffle').exists())
   self.assertFalse((target/'profile/smartshuffle/installation.json').exists())
   self.assertFalse((target/'profile/smartshuffle/fonts').exists())
   for name,data in keep.items():self.assertEqual((target/name).read_bytes(),data)

if __name__=='__main__':unittest.main()
