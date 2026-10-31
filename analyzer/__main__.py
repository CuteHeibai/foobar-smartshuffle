"""CLI consumed by the native foobar worker."""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile


def _publish(path: Path, result: dict) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=f".{path.name}.", suffix=".tmp", delete=False) as output:
            temporary = output.name
            json.dump(result, output, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract 65 bounded local audio features.")
    parser.add_argument("--input", required=True, type=Path, help="Decoded mono float32 WAV input")
    parser.add_argument("--output", required=True, type=Path, help="Atomic UTF-8 JSON result path")
    parser.add_argument("--metadata", action="store_true", help="Local search / explicit artist verification task")
    arguments = parser.parse_args()
    try:
        if arguments.metadata:
            from analyzer.metadata import execute
            request=json.loads(arguments.input.read_text(encoding="utf-8-sig"))
            result={"version":1,"ok":True,"result":execute(arguments.input.parent,request)}
        else:
            from analyzer.core import analyze_file
            result = {"version": 1, "ok": True, "features": analyze_file(arguments.input)}
        exit_code = 0
    except Exception as error:
        result = {"version": 1, "ok": False, "error": str(error)}
        exit_code = 1
    try:
        _publish(arguments.output, result)
    except Exception as error:
        print(f"Cannot write analyzer result '{arguments.output}': {error}", file=sys.stderr)
        return 2
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
