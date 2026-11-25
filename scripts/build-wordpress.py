#!/usr/bin/env python3
"""Build the reproducible, source-only WordPress plugin upload."""
import argparse
import hashlib
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "wordpress"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=ROOT / "dist")
args = parser.parse_args()
header = (PLUGIN / "convor.php").read_text()
version = re.search(r"^ \* Version: (\d+\.\d+\.\d+)$", header, re.M)
assert version, "Missing plugin version"
version = version.group(1)
assert f"Stable tag: {version}\n" in (PLUGIN / "readme.txt").read_text()
assert f"define( 'CONVOR_VERSION', '{version}' );" in header

files = [PLUGIN / name for name in ("convor.php", "uninstall.php", "readme.txt", "LICENSE")]
files += sorted((PLUGIN / "includes").glob("*.php"))
files += sorted((PLUGIN / "assets" / "js").glob("*.js"))
files += sorted(path for path in (PLUGIN / "languages").glob("*") if path.suffix in {".pot", ".po", ".mo"})
assert files and all(path.is_file() and not path.is_symlink() for path in files)
args.output.mkdir(parents=True, exist_ok=True)
target = args.output / f"convor-{version}.zip"
with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(files):
        info = zipfile.ZipInfo("convor/" + path.relative_to(PLUGIN).as_posix(), (1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(target.parent / (target.name + ".sha256")).write_text(f"{digest}  {target.name}\n")
print(f"{target}: SHA-256 {digest}")
