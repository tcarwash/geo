import os
from importlib.util import find_spec
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
BUILD = BACKEND / "build" / "pyinstaller"
DATA = BACKEND / "app" / "data"


def build_arguments(*, include_eccodeslib: bool | None = None) -> list[str]:
    if include_eccodeslib is None:
        include_eccodeslib = find_spec("eccodeslib") is not None
    arguments = [
        str(BACKEND / "desktop_launcher.py"),
        "--name=geo-backend",
        "--onedir",
        "--noconfirm",
        "--clean",
        f"--distpath={BACKEND / 'dist'}",
        f"--workpath={BUILD}",
        f"--specpath={BUILD}",
        f"--paths={BACKEND}",
        f"--add-data={DATA}{os.pathsep}app/data",
        "--collect-all=eccodes",
    ]
    if include_eccodeslib:
        arguments.append("--collect-all=eccodeslib")
    return arguments


def main() -> None:
    from PyInstaller.__main__ import run

    run(build_arguments())


if __name__ == "__main__":
    main()
