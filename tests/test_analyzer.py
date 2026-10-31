"""Contract tests; set SMARTSHUFFLE_ANALYZER_EXE to exercise the packaged CLI."""
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class AnalyzerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def core(self):
        self.assertIsNotNone(importlib.util.find_spec("analyzer"), "Analyzer package must implement the feature contract")
        from analyzer import core
        return core

    def tone(self, seconds=2, sr=22050):
        return (0.5 * np.sin(2 * np.pi * 440 * np.arange(int(seconds * sr)) / sr)).astype(np.float32)

    def assert_features(self, features):
        self.assertEqual(len(features), 65)
        self.assertTrue(all(isinstance(value, float) and math.isfinite(value) for value in features))

    def command(self, input_path, output_path):
        executable = os.environ.get("SMARTSHUFFLE_ANALYZER_EXE")
        command = [executable] if executable else [sys.executable, "-m", "analyzer"]
        return command + ["--input", str(input_path), "--output", str(output_path)]

    def test_feature_layout_and_determinism(self):
        core = self.core()
        first = core.analyze_audio(self.tone(), 22050)
        self.assert_features(first)
        self.assertEqual(first, core.analyze_audio(self.tone(), 22050))
        self.assertTrue(all(value >= 0 for value in first[20:40]))  # MFCC standard deviations
        self.assertTrue(all(0 <= value <= 1 for value in first[40:52]))
        self.assertAlmostEqual(first[61], 0.35355, delta=0.02)  # RMS mean
        self.assertGreater(first[63], 350)  # centroid, Hz
        self.assertLess(first[63], 550)
        self.assertLess(first[64], 0.01)  # sine has very low spectral flatness

    def test_noise_and_rhythmic_audio_are_distinguishable(self):
        core = self.core()
        sr = 22050
        tone = core.analyze_audio(self.tone(8), sr)
        noise = np.random.default_rng(123).normal(0, 0.2, sr * 8).astype(np.float32)
        noise_features = core.analyze_audio(noise, sr)
        self.assertGreater(noise_features[63], tone[63] + 2000)
        self.assertGreater(noise_features[64], tone[64] + 0.1)
        rhythm = np.zeros(sr * 8, dtype=np.float32)
        burst = np.random.default_rng(2).normal(0, 0.4, sr // 20).astype(np.float32)
        for index in range(0, rhythm.size, sr // 2):
            rhythm[index:index + burst.size] = burst
        rhythm_features = core.analyze_audio(rhythm, sr)
        self.assert_features(rhythm_features)
        self.assertGreater(rhythm_features[60], tone[60] + 0.1)  # onset std
        self.assertAlmostEqual(rhythm_features[59], 120, delta=5)

    def test_silence_and_single_sample_are_finite(self):
        core = self.core()
        for samples in [np.zeros(22050, np.float32), np.zeros(1, np.float32), np.array([0.5], np.float32)]:
            with self.subTest(length=samples.size):
                features = core.analyze_audio(samples, 22050)
                self.assert_features(features)
        silent = core.analyze_audio(np.zeros(22050, np.float32), 22050)
        self.assertEqual(silent[59], 0.0)
        self.assertEqual(silent[60:64], [0.0, 0.0, 0.0, 0.0])

    def test_single_sample_resamples_at_source_rates(self):
        core = self.core()
        for sample_rate in [8000, 44100, 48000, 192000]:
            with self.subTest(sample_rate=sample_rate):
                self.assert_features(core.analyze_audio(np.array([0.5], np.float32), sample_rate))

    def test_rejects_empty_nonfinite_and_invalid_rate(self):
        core = self.core()
        for samples, rate in [(np.array([], np.float32), 22050), (np.array([np.nan]), 22050),
                              (np.array([np.inf]), 22050), (self.tone(), 0)]:
            with self.subTest(rate=rate, samples=samples.size):
                with self.assertRaises(ValueError):
                    core.analyze_audio(samples, rate)

    def test_real_float32_wav_and_resampling(self):
        core = self.core()
        path = self.root / "sample 测试.wav"
        samples = self.tone(sr=48000)
        sf.write(path, samples, 48000, subtype="FLOAT")
        self.assertEqual(sf.info(path).subtype, "FLOAT")
        actual = core.analyze_file(path)
        self.assert_features(actual)
        np.testing.assert_allclose(actual, core.analyze_audio(samples, 48000), rtol=1e-6, atol=1e-6)
        self.assertAlmostEqual(actual[63], 440, delta=100)

    def test_input_is_bounded_to_first_ninety_seconds(self):
        core = self.core()
        sr = 8000
        base = np.zeros(sr * 90, np.float32)
        path = self.root / "long.wav"
        sf.write(path, np.concatenate([base, np.ones(sr, np.float32)]), sr, subtype="FLOAT")
        self.assertEqual(core.analyze_file(path), core.analyze_audio(base, sr))

    def test_cli_publishes_complete_json_atomically(self):
        input_path, output_path = self.root / "input.wav", self.root / "result.json"
        sf.write(input_path, self.tone(), 22050, subtype="FLOAT")
        output_path.write_text('{"previous":true}', encoding="utf-8")
        process = subprocess.Popen(self.command(input_path, output_path), cwd=ROOT,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 180
        while process.poll() is None and time.monotonic() < deadline:
            observed = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertTrue(observed.get("previous") or observed.get("ok"))
            time.sleep(0.01)
        stdout, stderr = process.communicate(timeout=5)
        self.assertEqual(process.returncode, 0, (stdout + stderr).decode(errors="replace"))
        result = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertEqual(set(result), {"version", "ok", "features"})
        self.assertEqual(result["version"], 1)
        self.assertIs(result["ok"], True)
        self.assert_features(result["features"])
        self.assertEqual(sorted(item.name for item in self.root.iterdir()), ["input.wav", "result.json"])

    def test_cli_errors_are_json_and_nonzero(self):
        corrupt = self.root / "broken.wav"
        corrupt.write_bytes(b"not an audio file")
        nonfinite = self.root / "nan.wav"
        sf.write(nonfinite, np.array([np.nan], np.float32), 22050, subtype="FLOAT")
        empty = self.root / "empty.wav"
        sf.write(empty, np.array([], np.float32), 22050, subtype="FLOAT")
        for path in [self.root / "missing.wav", corrupt, nonfinite, empty]:
            with self.subTest(path=path.name):
                output = self.root / "error.json"
                completed = subprocess.run(self.command(path, output), cwd=ROOT, capture_output=True, timeout=180)
                self.assertNotEqual(completed.returncode, 0)
                self.assertTrue(output.exists(), completed.stderr.decode(errors="replace"))
                result = json.loads(output.read_text(encoding="utf-8"))
                self.assertEqual(set(result), {"version", "ok", "error"})
                self.assertEqual(result["version"], 1)
                self.assertIs(result["ok"], False)
                self.assertGreater(len(result["error"]), 12)

    def test_cli_resampling_silence_and_single_sample(self):
        fixtures = [(self.tone(sr=48000), 48000), (np.zeros(44100, np.float32), 44100),
                    (np.array([0.5], np.float32), 192000)]
        for samples, sample_rate in fixtures:
            with self.subTest(sample_rate=sample_rate, length=samples.size):
                path, output = self.root / "sample.wav", self.root / "result.json"
                sf.write(path, samples, sample_rate, subtype="FLOAT")
                completed = subprocess.run(self.command(path, output), cwd=ROOT, capture_output=True, timeout=180)
                self.assertEqual(completed.returncode, 0, completed.stderr.decode(errors="replace"))
                result = json.loads(output.read_text(encoding="utf-8"))
                self.assertIs(result["ok"], True, result)
                self.assert_features(result["features"])
                np.testing.assert_allclose(result["features"], self.core().analyze_audio(samples, sample_rate),
                                           rtol=1e-6, atol=1e-6)


if __name__ == "__main__":
    unittest.main()
