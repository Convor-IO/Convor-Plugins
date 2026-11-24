#!/usr/bin/env python3
"""Collect verified local QA materials, without registering or submitting to Addons."""
from hashlib import sha256
from pathlib import Path
import json
import shutil
import struct

ROOT = Path(__file__).resolve().parents[3]
WEBSITE = ROOT.parents[2] / "website/.worktrees/feat-prestashop-finalization-1807"
OUTPUT = ROOT / "dist/prestashop-reviewer"
ZIP = ROOT / "dist/prestashop/convor.zip"


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def png_size(path):
    with path.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Not a PNG: {path}")
    return struct.unpack(">II", header[16:24])


def main():
    expected = (ZIP.parent / "convor.zip.sha256").read_text().split()[0]
    assert digest(ZIP) == expected
    for filename in ("convor.zip", "convor-1.1.0.zip"):
        for directory in (ZIP.parent, WEBSITE / "public/downloads/prestashop"):
            assert digest(directory / filename) == expected, f"Archive mismatch: {directory / filename}"
            checksum = (directory / f"{filename}.sha256").read_text().split()
            assert checksum == [expected, filename], f"Checksum mismatch: {directory / filename}"
    files = [
        (ZIP, "convor.zip", "tested direct-download candidate"),
        (ZIP.parent / "convor.zip.sha256", "convor.zip.sha256", "checksum"),
        (ROOT / "prestashop/MARKETPLACE.md", "listing-draft.md", "listing draft"),
        (ROOT / "prestashop/logo.png", "logo.png", "256x256 brand icon"),
    ]
    assert png_size(ROOT / "prestashop/logo.png") == (256, 256)
    for locale in ("en", "pl"):
        pdf = ROOT / f"prestashop-marketplace/convor-prestashop-guide-{locale}.pdf"
        assert pdf.read_bytes().startswith(b"%PDF-")
        files.append((pdf, f"guides/{pdf.name}", "rendered website guide"))
        for view in ("module-manager", "upload", "settings", "installation", "chat", "inbox", "cache", "checkout"):
            name = f"{locale}-prestashop-{view}.png"
            source = WEBSITE / "public/docs/screenshots" / locale / name
            width, height = png_size(source)
            # The installation card is intentionally a tightly cropped guide illustration,
            # not a full-page Marketplace screenshot. Preserve the original pixels.
            min_height = 900 if view == "installation" else 1000
            assert width >= 1000 and height >= min_height, name
            files.append((source, f"screenshots/{locale}/{name}", f"real {locale} QA screenshot"))

    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source, relative, purpose in files:
        destination = OUTPUT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        record = {"path": relative, "sha256": digest(destination),
                  "bytes": destination.stat().st_size, "purpose": purpose}
        if source.suffix == ".png":
            record["width"], record["height"] = png_size(source)
        manifest.append(record)
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "status": "PREPARED_LOCAL_NOT_SUBMITTED",
        "tested_archive_sha256": expected,
        "tested_prestashop_versions": ["8.2.9", "9.0.3", "9.1.5", "9.2.1"],
        "files": manifest,
    }, indent=2) + "\n")
    print(f"Prepared {len(manifest)} files, SHA-256 {expected}")
    print(f"Local reviewer bundle: {OUTPUT}")


if __name__ == "__main__":
    main()
