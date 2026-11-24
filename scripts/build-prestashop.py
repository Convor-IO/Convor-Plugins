#!/usr/bin/env python3
"""Build a deterministic, uploadable PrestaShop module archive and checksum."""
import argparse
from datetime import datetime, timedelta
import hashlib
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "prestashop"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=ROOT / "dist" / "prestashop")
args = parser.parse_args()
metadata = ET.parse(MODULE / "config.xml").getroot()
version = metadata.findtext("version")
assert metadata.findtext("name") == "convor"
assert version and re.fullmatch(r"\d+\.\d+\.\d+", version)
assert f"const VERSION = '{version}';" in (MODULE / "convor.php").read_text()
files = [MODULE / name for name in ("convor.php", "config.xml", "logo.png", "README.md", "CHANGELOG.md", ".htaccess")]
for directory in ("classes", "controllers", "views", "translations", "upgrade", "docs"):
    files.extend(p for p in (MODULE / directory).rglob("*") if p.is_file() and p.suffix in {".php", ".js", ".tpl", ".pdf"})
assert all(p.is_file() and not p.is_symlink() for p in files)
assert len(files) == len(set(files))
args.output.mkdir(parents=True, exist_ok=True)
target = args.output / "convor.zip"
def write(archive, name, data):
    # A fixed ZIP timestamp makes changed PHP code look unchanged to OPcache
    # after extraction. Preserve reproducibility with a content-derived DOS
    # timestamp (2-second precision, within the historical ZIP date range).
    slot = int.from_bytes(hashlib.sha256(data).digest()[:8], "big") % (20 * 365 * 24 * 60 * 30)
    stamp = datetime(2000, 1, 1) + timedelta(seconds=slot * 2)
    info = zipfile.ZipInfo("convor/" + name, stamp.timetuple()[:6])
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

with zipfile.ZipFile(target, "w") as archive:
    for file in sorted(files):
        write(archive, file.relative_to(MODULE).as_posix(), file.read_bytes())
    write(archive, "LICENSE", (ROOT / "LICENSE").read_bytes())
    # Defend directory indexes, including directories added in later releases.
    directories = {Path(".")}
    for file in files:
        directories.update(file.relative_to(MODULE).parents)
    for directory in sorted(directories):
        name = (directory / "index.php").as_posix()
        if name not in {f.relative_to(MODULE).as_posix() for f in files}:
            write(archive, name, b"<?php\nhttp_response_code(404);\nexit;\n")
archive_bytes = target.read_bytes()
digest = hashlib.sha256(archive_bytes).hexdigest()
(target.parent / "convor.zip.sha256").write_text(f"{digest}  convor.zip\n")
# A versioned candidate is a byte-for-byte alias, never a second build.
# Publication and immutable release tagging are separate approved steps.
versioned = target.parent / f"convor-{version}.zip"
versioned.write_bytes(archive_bytes)
versioned.with_suffix(".zip.sha256").write_text(f"{digest}  {versioned.name}\n")
print(f"{target}: v{version} SHA-256 {digest}")
