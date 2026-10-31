import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from analyzer import covers


GROUP = '48140466-cff6-3222-bd55-63c27e43190d'
RELEASE = '76df3287-6cda-33eb-8e9a-044b5e15ffdd'
OTHER = '11111111-1111-1111-1111-111111111111'
JPEG = b'\xff\xd8\xff\xe0' + b'cover image' * 8


class Response:
    def __init__(self, data, status=200, mime='application/json', headers=None):
        self.status_code = status
        self.headers = {'Content-Type': mime, **(headers or {})}
        self.data = json.dumps(data).encode() if isinstance(data, dict) else data
        self.url = 'https://archive.org/download/example/front-500.jpg'

    def iter_content(self, chunk_size):
        yield self.data

    def close(self):
        pass

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.HTTPError(str(self.status_code), response=self)


def candidate(identity=GROUP, artist='Muse', title='Absolution'):
    return {'id': identity, 'title': title, 'score': 100,
            'artist-credit': [{'name': artist, 'artist': {'name': artist}}]}


class CoverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.track = self.root / 'music' / 'track.flac'
        self.track.parent.mkdir()
        self.track.write_bytes(b'original music and tags')
        self.row = {'path': str(self.track), 'subsong': 0, 'artist': 'Muse', 'album': 'Absolution'}
        self.sleep = patch('analyzer.covers.time.sleep').start()
        self.addCleanup(patch.stopall)

    def run_covers(self, rows=None, **options):
        return covers.execute(self.root, {'task': 'covers', 'rows': rows or [self.row], **options})

    def download_responses(self):
        return [Response({'release-groups': [candidate()], 'count': 1}),
                Response(JPEG, mime='image/jpeg')]

    def test_unique_exact_album_downloads_and_records_provenance_without_touching_music(self):
        with patch('requests.get', side_effect=self.download_responses()):
            result = self.run_covers()
        item = result['covers'][0]
        self.assertEqual(item['status'], 'downloaded')
        self.assertEqual(Path(item['cover']).read_bytes(), JPEG)
        self.assertEqual(Path(item['cover']).parent, self.root / 'album-covers')
        self.assertEqual(item['musicbrainz'], 'https://musicbrainz.org/release-group/' + GROUP)
        self.assertEqual(item['source'], 'https://coverartarchive.org/release-group/' + GROUP + '/front-500')
        self.assertEqual(self.track.read_bytes(), b'original music and tags')
        self.assertEqual(list(self.track.parent.iterdir()), [self.track])
        manifest = json.loads((self.root / 'covers.json').read_text())
        self.assertEqual(manifest['tracks'][str(self.track) + '|0']['cover'], item['cover'])

    def test_cache_is_reused_after_restart_for_multiple_subsongs_without_network(self):
        with patch('requests.get', side_effect=self.download_responses()):
            self.run_covers()
        rows = [self.row, {**self.row, 'subsong': 1, 'path': str(self.track.with_name('another.flac'))}]
        with patch('requests.get', side_effect=AssertionError('cached artwork used network')):
            result = self.run_covers(rows)
        self.assertEqual([r['status'] for r in result['covers']], ['cached', 'cached'])
        self.assertEqual(result['covers'][1]['subsong'], 1)

    def test_ambiguous_exact_albums_do_not_guess(self):
        with patch('requests.get', return_value=Response({'release-groups': [candidate(), candidate(OTHER)], 'count': 2})):
            result = self.run_covers()
        self.assertEqual(result['covers'][0]['status'], 'ambiguous')
        self.assertFalse(list((self.root / 'album-covers').glob('*')))

    def test_other_artist_or_edition_is_not_used(self):
        for entry in [candidate(artist='Someone Else'), candidate(title='Absolution (Live)')]:
            with patch('requests.get', return_value=Response({'release-groups': [entry], 'count': 1})):
                result = self.run_covers(force=True)
            self.assertEqual(result['covers'][0]['status'], 'missing')

    def test_existing_release_id_works_without_artist_or_album_search(self):
        row = {**self.row, 'artist': '', 'album': '', 'musicbrainz_albumid': RELEASE}
        urls = []
        def network(url, **kwargs):
            urls.append(url)
            return Response(JPEG, mime='image/jpeg')
        with patch('requests.get', side_effect=network):
            result = self.run_covers([row])
        self.assertEqual(urls, ['https://coverartarchive.org/release/' + RELEASE + '/front-500'])
        self.assertEqual(result['covers'][0]['status'], 'downloaded')

    def test_release_group_tag_is_fallback_when_release_front_is_absent(self):
        row = {**self.row, 'musicbrainz_albumid': RELEASE, 'musicbrainz_releasegroupid': GROUP}
        with patch('requests.get', side_effect=[Response(b'', status=404), Response(JPEG, mime='image/jpeg')]):
            result = self.run_covers([row])
        self.assertEqual(result['covers'][0]['musicbrainz'], 'https://musicbrainz.org/release-group/' + GROUP)

    def test_missing_image_is_negative_cached_and_force_can_retry(self):
        row = {**self.row, 'musicbrainz_releasegroupid': GROUP}
        with patch('requests.get', return_value=Response(b'', status=404)):
            self.assertEqual(self.run_covers([row])['covers'][0]['status'], 'missing')
        with patch('requests.get', side_effect=AssertionError('negative cache used network')):
            self.assertEqual(self.run_covers([row])['covers'][0]['status'], 'missing')
        with patch('requests.get', return_value=Response(JPEG, mime='image/jpeg')):
            self.assertEqual(self.run_covers([row], force=True)['covers'][0]['status'], 'downloaded')

    def test_startup_refresh_missing_retries_negative_result_but_reuses_success(self):
        row = {**self.row, 'musicbrainz_releasegroupid': GROUP}
        with patch('requests.get', return_value=Response(b'', status=404)):
            self.run_covers([row])
        with patch('requests.get', return_value=Response(JPEG, mime='image/jpeg')):
            self.assertEqual(self.run_covers([row], refresh_missing=True)['covers'][0]['status'], 'downloaded')
        with patch('requests.get', side_effect=AssertionError('startup refreshed existing successful image')):
            self.assertEqual(self.run_covers([row], refresh_missing=True)['covers'][0]['status'], 'cached')

    def test_invalid_row_and_malformed_mbid_are_rejected_without_network(self):
        rows = [None, {}, {**self.row, 'subsong': -1}, {**self.row, 'musicbrainz_albumid': '../../x'},
                {**self.row, 'album': ''}]
        with patch('requests.get', side_effect=AssertionError('invalid input used network')):
            self.assertEqual([r['status'] for r in self.run_covers(rows)['covers']], ['invalid'] * 5)

    def test_existing_native_artwork_skips_lookup(self):
        with patch('requests.get', side_effect=AssertionError('existing artwork used network')):
            self.assertEqual(self.run_covers([{**self.row, 'has_artwork': True}])['covers'][0]['status'], 'existing')

    def test_album_budget_defers_work_and_next_run_advances(self):
        rows = [self.row, {**self.row, 'path': 'second.flac', 'album': 'Origin of Symmetry'}]
        with patch('requests.get', side_effect=self.download_responses()):
            result = self.run_covers(rows, max_albums=1)
        self.assertTrue(result['pending'])
        self.assertEqual([r['status'] for r in result['covers']], ['downloaded', 'deferred'])
        with patch('requests.get', side_effect=[Response({'release-groups': [candidate(title='Origin of Symmetry')], 'count': 1}), Response(JPEG, mime='image/jpeg')]):
            result = self.run_covers(rows, max_albums=1)
        self.assertFalse(result['pending'])
        self.assertEqual([r['status'] for r in result['covers']], ['cached', 'downloaded'])

    def test_image_size_and_non_image_content_are_rejected_without_partial_files(self):
        row = {**self.row, 'musicbrainz_releasegroupid': GROUP}
        responses = [Response(b'not an image', mime='text/html'),
                     Response(JPEG, mime='image/jpeg', headers={'Content-Length': str(6 * 1024 * 1024)}),
                     Response(b'x' * (6 * 1024 * 1024), mime='image/jpeg')]
        for response in responses:
            with patch('requests.get', return_value=response):
                self.assertEqual(self.run_covers([row], force=True)['covers'][0]['status'], 'error')
            self.assertFalse(list((self.root / 'album-covers').iterdir()))

    def test_transient_http_failure_does_not_abort_other_album_results(self):
        rows = [{**self.row, 'musicbrainz_releasegroupid': GROUP},
                {**self.row, 'path': 'second.flac', 'musicbrainz_releasegroupid': OTHER}]
        with patch('requests.get', side_effect=[Response(b'', status=503), Response(JPEG, mime='image/jpeg')]):
            result = self.run_covers(rows)
        self.assertEqual([r['status'] for r in result['covers']], ['error', 'downloaded'])

    def test_missing_cached_file_is_downloaded_again(self):
        row = {**self.row, 'musicbrainz_releasegroupid': GROUP}
        with patch('requests.get', return_value=Response(JPEG, mime='image/jpeg')):
            result = self.run_covers([row])
            Path(result['covers'][0]['cover']).unlink()
            result = self.run_covers([row])
        self.assertEqual(result['covers'][0]['status'], 'downloaded')

    def test_musicbrainz_calls_wait_for_shared_rate_marker(self):
        (self.root / 'musicbrainz-time.txt').write_text('100.0')
        with patch('analyzer.covers.time.time', return_value=100.5), patch('requests.get', side_effect=self.download_responses()):
            self.run_covers()
        self.assertTrue(any(call.args[0] >= 0.59 for call in self.sleep.call_args_list))

    def test_wrong_task_or_non_array_rows_raise_clear_input_error(self):
        for request in [{'task': 'other', 'rows': []}, {'task': 'covers', 'rows': {}}, {'task': 'covers'}]:
            with self.assertRaises(ValueError):
                covers.execute(self.root, request)


if __name__ == '__main__':
    unittest.main()
