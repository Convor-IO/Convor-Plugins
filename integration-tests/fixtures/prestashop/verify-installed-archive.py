#!/usr/bin/env python3
"""Check the complete distributed ZIP against an owned disposable shop, without writes."""
import argparse
from hashlib import sha256
from io import BytesIO
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[3]
PROJECTS = (
    "convor-prestashop-1807",
    "convor-prestashop-1807-82",
    "convor-prestashop-1807-90",
    "convor-prestashop-1807-91",
)


def verify(project, archive):
    container = f"{project}-prestashop-1"
    label = subprocess.check_output(
        ["docker", "inspect", "-f",
         '{{ index .Config.Labels "com.docker.compose.project" }}', container],
        text=True,
    ).strip()
    if label != project:
        raise ValueError("Not an owned acceptance fixture")
    with zipfile.ZipFile(archive) as source:
        expected = {}
        for entry in source.infolist():
            if entry.is_dir():
                continue
            if not entry.filename.startswith("convor/"):
                raise ValueError("Unexpected archive root")
            name = entry.filename.removeprefix("convor/")
            if name in expected:
                raise ValueError(f"Duplicate archive member: {name}")
            expected[name] = sha256(source.read(entry)).hexdigest()

    # docker cp supports stopped fixtures too; tar is inspected, never extracted.
    payload = subprocess.check_output(
        ["docker", "cp", f"{container}:/var/www/html/modules/convor/.", "-"]
    )
    actual = {}
    with tarfile.open(fileobj=BytesIO(payload), mode="r:*") as installed:
        for entry in installed:
            if entry.isdir():
                continue
            name = PurePosixPath(entry.name).as_posix().removeprefix("./")
            if not entry.isfile() or name in actual:
                raise ValueError(f"Unexpected installed entry: {name}")
            with installed.extractfile(entry) as stream:
                actual[name] = sha256(stream.read()).hexdigest()

    missing = sorted(expected.keys() - actual.keys())
    extra = sorted(actual.keys() - expected.keys())
    different = sorted(name for name in expected.keys() & actual.keys()
                       if expected[name] != actual[name])
    if missing or extra or different:
        raise ValueError(f"{project}: missing={missing}; extra={extra}; changed={different}")
    print(f"PASS: {project}: all {len(expected)} archive files match, no extras")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("projects", nargs="+", choices=PROJECTS)
    parser.add_argument("--archive", type=Path, default=ROOT / "dist/prestashop/convor.zip")
    args = parser.parse_args()
    for project in args.projects:
        verify(project, args.archive)
