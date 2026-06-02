#!/usr/bin/env python3
"""Parse Python files without writing bytecode."""

import ast
import sys
from pathlib import Path


def iter_python_files(root: Path):
    for path in root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        yield path


def check_file(path: Path) -> bool:
    try:
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        return True
    except SyntaxError as error:
        print(f"{path}:{error.lineno}:{error.offset}: {error.msg}", file=sys.stderr)
        if error.text:
            print(error.text.rstrip(), file=sys.stderr)
        return False


def main() -> int:
    roots = [Path(arg) for arg in sys.argv[1:]] or [Path("packages/cli")]
    files = [path for root in roots for path in iter_python_files(root)]
    failed = [path for path in files if not check_file(path)]

    if failed:
        print(f"Python syntax check failed for {len(failed)} file(s).", file=sys.stderr)
        return 1

    print(f"Python syntax check passed for {len(files)} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
