import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from analyzer.metadata import search, lookup_artist, confirm_artist, read_lyrics, auto_artist, get_json, norm

class MetadataTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  self.rows=[{'id':'cn|0','path':str(self.root/'a.flac'),'title':'夜曲','artist':'周杰伦','album':'十一月的萧邦','lyrics':''},
   {'id':'ja|0','path':str(self.root/'b.flac'),'title':'青春コンプレックス','artist':'結束バンド','album':'結束バンド','lyrics':''},
   {'id':'en|0','path':str(self.root/'c.flac'),'title':'Starlight','artist':'Muse','album':'Black Holes','lyrics':'Far away this ship is taking me far away'}]
 def query(self,q):return search(self.root,{'rows':self.rows,'query':q})['matches']
 def test_japanese_voicing_remains_distinct_for_identity_verification(self):
  self.assertNotEqual(norm('が'),norm('か'));self.assertEqual(norm('Ｃａｆé'),norm('cafe'))
 def test_pinyin_and_initials(self):
  for q in ('yequ','zhou jie lun','zjl','夜曲'):self.assertEqual(self.query(q)[0]['id'],'cn|0',q)
 def test_romaji_kanji_and_kana(self):
  for q in ('seishun','konpurekkusu','kessoku bando','ｓｅｉｓｈｕｎ'):self.assertEqual(self.query(q)[0]['id'],'ja|0',q)
 def test_typo_and_multiword(self):
  self.assertEqual(self.query('starligt')[0]['id'],'en|0');self.assertEqual(self.query('muse starlight')[0]['id'],'en|0')
 def test_lyric_snippet(self):
  r=self.query('this ship')[0];self.assertEqual(r['id'],'en|0');self.assertEqual(r['reason'],'歌词');self.assertIn('ship',r['snippet'])
 def test_sidecar_changed_deleted_and_cue(self):
  p=self.root/'a.lrc';p.write_text('[00:01.00]窗外的麻雀\n[ar:x]',encoding='utf-8');self.assertEqual(self.query('窗外')[0]['id'],'cn|0')
  p.write_text('[00:01.00]新的歌词',encoding='utf-8');self.assertFalse(self.query('窗外'));self.assertTrue(self.query('新的歌词'))
  p.unlink();self.assertFalse(self.query('新的歌词'));self.assertEqual(read_lyrics({'path':str(self.root/'missing.cue'),'lyrics':''},self.root),'')
 def test_utf16_lyrics(self):
  (self.root/'a.lrc').write_text('[00:01.00]带有编码的歌词',encoding='utf-16');self.assertEqual(self.query('编码')[0]['id'],'cn|0')
 def test_verified_portrait_survives_refresh_without_an_image(self):
  portrait=self.root/'old.jpg';portrait.write_bytes(b'image')
  (self.root/'artists.json').write_text(json.dumps({'Original':{'mbid':'11111111-1111-1111-1111-111111111111','portrait':str(portrait),'portrait_license':'CC BY'}}),encoding='utf-8')
  with patch('analyzer.metadata.get_json',return_value={'id':'11111111-1111-1111-1111-111111111111','name':'Name','relations':[]}):
   r=confirm_artist(self.root,{'name':'Original','mbid':'11111111-1111-1111-1111-111111111111'})['artist']
  self.assertEqual(r['portrait'],str(portrait));self.assertEqual(r['portrait_license'],'CC BY')
 def test_removed_entries_and_metadata_change(self):
  self.query('夜曲');self.rows.pop(0);self.assertFalse(self.query('夜曲'))
  self.rows[0]['title']='更名';self.assertTrue(self.query('gengming'))
 def test_artist_candidates_are_not_verified_or_persisted(self):
  with patch('analyzer.metadata.get_json',return_value={'artists':[{'id':'11111111-1111-1111-1111-111111111111','name':'Same','disambiguation':'first'},{'id':'22222222-2222-2222-2222-222222222222','name':'Same','disambiguation':'second'}]}):
   r=lookup_artist(self.root,{'name':'Same'});self.assertEqual(len(r['candidates']),2);self.assertFalse((self.root/'artists.json').exists())
 def test_artist_confirm_keeps_identity_and_missing_portrait_neutral(self):
  with patch('analyzer.metadata.get_json',return_value={'id':'11111111-1111-1111-1111-111111111111','name':'Verified Name','relations':[]}):
   r=confirm_artist(self.root,{'name':'Original','mbid':'11111111-1111-1111-1111-111111111111'})
  entry=json.loads((self.root/'artists.json').read_text(encoding='utf-8'))['Original'];self.assertTrue(entry['verified']);self.assertEqual(entry['name'],'Verified Name');self.assertFalse(entry.get('portrait'));self.assertIn('musicbrainz.org/artist/',entry['source'])
 def test_silent_unique_artist_is_confirmed(self):
  candidate={'mbid':'11111111-1111-1111-1111-111111111111','name':'Unique','aliases':[]}
  with patch('analyzer.metadata.lookup_artist',return_value={'candidates':[candidate]}),patch('analyzer.metadata.confirm_artist',return_value={'artist':{'verified':True}}) as confirm:
   self.assertTrue(auto_artist(self.root,{'name':'Unique'})['artist']['verified']);self.assertEqual(confirm.call_count,1)
 def test_silent_ambiguous_artist_does_not_guess(self):
  candidates=[{'mbid':'11111111-1111-1111-1111-111111111111','name':'Same'},{'mbid':'22222222-2222-2222-2222-222222222222','name':'Same'}]
  with patch('analyzer.metadata.lookup_artist',return_value={'candidates':candidates}),patch('analyzer.metadata.confirm_artist') as confirm,patch('analyzer.metadata.wikidata_artist_ids',return_value=[]):
   self.assertTrue(auto_artist(self.root,{'name':'Same'})['needs_review']);confirm.assert_not_called()
 def test_silent_release_credit_resolves_same_name(self):
  identity='22222222-2222-2222-2222-222222222222'
  candidates=[{'mbid':'11111111-1111-1111-1111-111111111111','name':'Same'},{'mbid':identity,'name':'Same'}]
  with patch('analyzer.metadata.lookup_artist',return_value={'candidates':candidates}),patch('analyzer.metadata.mb_endpoint',return_value={'release-groups':[{'title':'Specific Album','artist-credit':[{'artist':{'id':identity}}]}]}),patch('analyzer.metadata.confirm_artist',return_value={'artist':{'verified':True}}) as confirm:
   auto_artist(self.root,{'name':'Same','albums':['Specific Album']});self.assertEqual(confirm.call_args.args[1]['mbid'],identity)
 def test_temporary_service_limit_retries_without_dropping_cache(self):
  from unittest.mock import Mock
  limited=Mock(status_code=503,headers={'Retry-After':'2'});success=Mock(status_code=200);success.json.return_value={'ok':True}
  with patch('requests.get',side_effect=[limited,success]) as get,patch('analyzer.metadata.time.sleep') as sleep:
   self.assertEqual(get_json('https://musicbrainz.org/test'),{'ok':True});self.assertEqual(get.call_count,2);sleep.assert_called_once_with(2)
 def test_secondary_identity_source_handles_musicbrainz_search_outage(self):
  with patch('analyzer.metadata.lookup_artist',side_effect=OSError('503')),patch('analyzer.metadata.wikidata_artist_ids',return_value=['11111111-1111-1111-1111-111111111111']),patch('analyzer.metadata.confirm_artist',return_value={'artist':{'verified':True}}) as confirm:
   self.assertTrue(auto_artist(self.root,{'name':'Name'})['artist']['verified']);self.assertEqual(confirm.call_count,1)
 def test_failed_verification_preserves_old_cache(self):
  (self.root/'artists.json').write_text('{"Original":{"verified":true}}',encoding='utf-8')
  with patch('analyzer.metadata.get_json',side_effect=OSError('offline')):
   with self.assertRaises(OSError):confirm_artist(self.root,{'name':'Original','mbid':'11111111-1111-1111-1111-111111111111'})
  self.assertTrue(json.loads((self.root/'artists.json').read_text())['Original']['verified'])
 def test_opening_a_cached_artist_revalidates_the_saved_identity(self):
  identity='11111111-1111-1111-1111-111111111111'
  (self.root/'artists.json').write_text(json.dumps({'Name':{'verified':True,'mbid':identity}}),encoding='utf-8')
  with patch('analyzer.metadata.lookup_artist') as lookup,patch('analyzer.metadata.confirm_artist',return_value={'artist':{'verified':True}}) as confirm:
   auto_artist(self.root,{'name':'Name'});lookup.assert_not_called();self.assertEqual(confirm.call_args.args[1]['mbid'],identity)

if __name__=='__main__':unittest.main()
