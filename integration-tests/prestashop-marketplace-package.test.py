#!/usr/bin/env python3
"""The Marketplace envelope must not modify the tested direct-download archive."""
from hashlib import sha256
from pathlib import Path
import json
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temp:
    temp = Path(temp)
    direct = temp / "direct"
    subprocess.run(["python3", str(ROOT / "scripts/build-prestashop.py"),
                    "--output", str(direct)], check=True, capture_output=True)
    source = direct / "convor.zip"
    original = source.read_bytes()
    guides = temp / "guides"
    guides.mkdir()
    for locale in ("en", "pl"):
        # Test transport/packaging only; real PDFs undergo separate guide QA.
        (guides / f"readme_{locale}.pdf").write_bytes(b"%PDF-1.4\n% fixture\n")
    output = temp / "marketplace"
    cmd = ["python3", str(ROOT / "scripts/build-prestashop-marketplace.py"),
           "--source", str(source), "--guides", str(guides), "--output", str(output)]
    def build(*args):
        subprocess.run(cmd + list(args), check=True, capture_output=True)
        assert source.read_bytes() == original
        return (output / "convor.zip").read_bytes()
    preflight = build()
    assert preflight == build()
    manifest = json.loads((output / "manifest.json").read_text())
    assert manifest["status"] == "PREFLIGHT_ONLY_NO_MODULE_KEY"
    assert manifest["direct_candidate_sha256"] == sha256(original).hexdigest()
    assert not manifest["official_validator_passed"]
    with zipfile.ZipFile(source) as a, zipfile.ZipFile(output / "convor.zip") as b:
        assert set(b.namelist()) == set(a.namelist()) - {"convor/README.md"} | {
            "convor/header_csp.txt", "convor/docs/index.php",
            "convor/docs/readme_en.pdf", "convor/docs/readme_pl.pdf"}
        for name in set(a.namelist()) & set(b.namelist()):
            assert a.read(name) == b.read(name)
            assert a.getinfo(name).date_time == b.getinfo(name).date_time
        assert b"$this->module_key" not in b.read("convor/convor.php")
        old_stamp = b.getinfo("convor/convor.php").date_time
    key = temp / "synthetic-key"
    key.write_text("0" * 32)
    keyed = build("--module-key-file", str(key))
    assert keyed == build("--module-key-file", str(key))
    assert keyed != preflight
    with zipfile.ZipFile(output / "convor.zip") as b:
        assert b"$this->module_key = '" + b"0" * 32 + b"';" in b.read("convor/convor.php")
        assert b.getinfo("convor/convor.php").date_time != old_stamp
    manifest = json.loads((output / "manifest.json").read_text())
    assert manifest["status"] == "KEYED_CANDIDATE_RETEST_REQUIRED"
    assert manifest["marketplace_candidate_sha256"] == sha256(keyed).hexdigest()
    assert not manifest["official_validator_passed"]
    key.write_text("invalid';")
    assert subprocess.run(cmd + ["--module-key-file", str(key)], capture_output=True).returncode != 0
    assert source.read_bytes() == original
    assert (output / "convor.zip").read_bytes() == keyed
    assert subprocess.run(cmd + ["--output", str(direct)], capture_output=True).returncode != 0
print("PASS: Marketplace envelope, exact direct archive, deterministic output, key validation, separate status and checksum")
