#!/usr/bin/env python3
"""Exercise archive contents, reproducibility and update-safe PHP timestamps."""
import hashlib
import pathlib
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    fixture = pathlib.Path(directory)
    shutil.copytree(root / "prestashop", fixture / "prestashop")
    (fixture / "scripts").mkdir()
    shutil.copyfile(root / "scripts/build-prestashop.py", fixture / "scripts/build-prestashop.py")
    shutil.copyfile(root / "LICENSE", fixture / "LICENSE")
    output = fixture / "dist"
    command = ["python3", str(fixture / "scripts/build-prestashop.py"), "--output", str(output)]
    def build():
        subprocess.run(command, check=True, capture_output=True)
        return (output / "convor.zip").read_bytes()
    original = build()
    assert original == build(), "Identical inputs must produce identical archive bytes"
    version = ET.parse(fixture / "prestashop/config.xml").getroot().findtext("version")
    versioned = output / f"convor-{version}.zip"
    assert versioned.read_bytes() == original
    assert versioned.with_suffix(".zip.sha256").read_text().strip() == f"{hashlib.sha256(original).hexdigest()}  {versioned.name}"
    with zipfile.ZipFile(output / "convor.zip") as archive:
        names = archive.namelist()
        assert len(names) == len(set(names))
        assert all(n.startswith("convor/") and ".." not in pathlib.PurePosixPath(n).parts for n in names)
        assert "convor/classes/ConvorVisitorSession.php" in names
        stamp = archive.getinfo("convor/convor.php").date_time
    path = fixture / "prestashop/convor.php"
    path.write_bytes(path.read_bytes() + b"\n// Fixture: updated source.\n")
    updated = build()
    assert updated != original
    with zipfile.ZipFile(output / "convor.zip") as archive:
        assert archive.getinfo("convor/convor.php").date_time != stamp, (
            "A changed PHP file must not retain an identical ZIP modification timestamp"
        )
    assert (output / "convor.zip.sha256").read_text().split()[0] == hashlib.sha256(updated).hexdigest()
    assert versioned.read_bytes() == updated
    assert versioned.with_suffix(".zip.sha256").read_text().strip() == f"{hashlib.sha256(updated).hexdigest()}  {versioned.name}"
print("PASS: deterministic PrestaShop archive, required class, SHA256 and update-safe PHP timestamps")
