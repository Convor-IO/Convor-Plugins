#!/usr/bin/env python3
"""Assemble the Marketplace-only candidate from the tested direct ZIP.

Without an issued key this builds a validator/preflight candidate, NOT a
submission-ready artifact. Never overwrite the tested direct-download ZIP.
"""
import argparse
from datetime import datetime, timedelta
from hashlib import sha256
from pathlib import Path, PurePosixPath
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOMAINS = "api.convor.io;cdn.convor.io;dashboard.convor.io;ws.convor.io\n"
ANCHOR = b"        $this->name = 'convor';\n"
GUARD = b"<?php\nhttp_response_code(404);\nexit;\n"


def add(archive, name, data):
    slot = int.from_bytes(sha256(data).digest()[:8], "big") % (20 * 365 * 24 * 60 * 30)
    stamp = datetime(2000, 1, 1) + timedelta(seconds=slot * 2)
    info = zipfile.ZipInfo(name, stamp.timetuple()[:6])
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def build(source, guides, output, key_file):
    source = source.resolve(strict=True)
    output = output.resolve()
    if output == source.parent:
        raise ValueError("Marketplace output cannot replace direct download")
    source_hash = sha256(source.read_bytes()).hexdigest()
    checksum = source.with_suffix(".zip.sha256").read_text().split()
    if checksum != [source_hash, source.name]:
        raise ValueError("Direct candidate checksum mismatch")
    key = None
    if key_file is not None:
        key = key_file.read_text().strip()
        if not re.fullmatch(r"[a-fA-F0-9]{32}", key):
            raise ValueError("Expected the issued 32-character hexadecimal module_key")

    with zipfile.ZipFile(source) as original:
        entries = {}
        for entry in original.infolist():
            name = entry.filename
            if (entry.is_dir() or name in entries or
                not name.startswith("convor/") or
                ".." in PurePosixPath(name).parts or
                "\\" in name):
                raise ValueError("Invalid direct candidate member")
            entries[name] = (entry, original.read(entry))
        main = entries["convor/convor.php"][1]
        if main.count(ANCHOR) != 1 or b"$this->module_key" in main:
            raise ValueError("Unexpected main module constructor")
        added = {"convor/header_csp.txt": DOMAINS.encode(),
                 "convor/docs/index.php": GUARD}
        for locale in ("en", "pl"):
            pdf = (guides / f"readme_{locale}.pdf").read_bytes()
            if not pdf.startswith(b"%PDF-"):
                raise ValueError(f"Invalid Marketplace PDF ({locale})")
            added[f"convor/docs/readme_{locale}.pdf"] = pdf
        if entries.keys() & added.keys():
            raise ValueError("Unexpected Marketplace files in direct archive")
        output.mkdir(parents=True, exist_ok=True)
        archive = output / "convor.zip"
        # Preserve all runtime source bytes and modification times except for
        # the mandated constructor assignment in the keyed build.
        with zipfile.ZipFile(archive, "w") as target:
            for name, (entry, data) in entries.items():
                if name == "convor/README.md":
                    continue  # Marketplace uses the dedicated PDFs.
                if name == "convor/convor.php" and key:
                    data = data.replace(ANCHOR, ANCHOR + f"        $this->module_key = '{key}';\n".encode())
                    add(target, name, data)
                else:
                    target.writestr(entry, data)
            for name, data in sorted(added.items()):
                add(target, name, data)

    digest = sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".zip.sha256").write_text(f"{digest}  convor.zip\n")
    status = "KEYED_CANDIDATE_RETEST_REQUIRED" if key else "PREFLIGHT_ONLY_NO_MODULE_KEY"
    (output / "manifest.json").write_text(json.dumps({
        "status": status,
        "direct_candidate_sha256": source_hash,
        "marketplace_candidate_sha256": digest,
        "marketplace_key_present": bool(key),
        "documentation_sha256": {locale: sha256((guides / f"readme_{locale}.pdf").read_bytes()).hexdigest() for locale in ("en", "pl")},
        "official_validator_passed": False,
    }, indent=2) + "\n")
    print(f"{status}: {archive} SHA-256 {digest}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "dist/prestashop/convor.zip")
    parser.add_argument("--guides", type=Path, required=True,
                        help="Directory with reviewed Marketplace-only readme_en.pdf and readme_pl.pdf")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/prestashop-marketplace/package")
    parser.add_argument("--module-key-file", type=Path,
                        help="File containing the actual key issued by Seller Portal; omit for preflight only")
    args = parser.parse_args()
    build(args.source, args.guides, args.output, args.module_key_file)
