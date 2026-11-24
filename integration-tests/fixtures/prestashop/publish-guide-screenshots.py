#!/usr/bin/env python3
"""Publish actual, already masked QA captures with an unclipped display margin."""
import argparse
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import re
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[3]
WEBSITE = ROOT.parents[2] / "website/.worktrees/feat-prestashop-finalization-1807"
CAPTURES = ROOT / "dist/docs-screenshots"
MARGIN = 24
VIEWS = ("module-manager", "upload", "settings", "installation", "chat", "inbox", "cache", "checkout")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--captures", type=Path, default=CAPTURES)
    parser.add_argument("--views", nargs="+", choices=VIEWS, default=VIEWS)
    args = parser.parse_args()
    for locale in ("en", "pl"):
        guide = WEBSITE / "content/docs/integrations" / (
            "prestashop-integration.pl.mdx" if locale == "pl"
            else "prestashop-integration.mdx"
        )
        content = guide.read_text()
        for view in args.views:
            name = f"{locale}-prestashop-{view}.png"
            source = args.captures / locale / name
            destination = WEBSITE / "public/docs/screenshots" / locale / name
            # Preserve the complete actual capture, including the existing
            # credential masks. A neutral frame separates its edges from
            # adjacent prose; it does not modify the store UI.
            with Image.open(source) as capture:
                canvas = ImageOps.expand(capture.convert("RGB"), border=MARGIN, fill="white")
                out = BytesIO()
                canvas.save(out, format="PNG", optimize=True)
                data = out.getvalue()
                width, height = canvas.size
            tag = re.compile(
                r'(<DocsScreenshot src="/docs/screenshots/' + locale + '/' +
                re.escape(name) + r'\?v=)[a-f0-9]{12}("[^>]*? width=\{)\d+(\} height=\{)\d+(\}[^>]*?/>)'
            )
            content, count = tag.subn(
                lambda m: m[1] + sha256(data).hexdigest()[:12] + m[2]
                + str(width) + m[3] + str(height) + m[4], content
            )
            assert count == 1, name
            destination.write_bytes(data)
            print(f"{name}: {width}x{height} {sha256(data).hexdigest()[:12]}")
        guide.write_text(content)


if __name__ == "__main__":
    main()
