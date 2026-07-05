#!/usr/bin/env python3
"""Generate the Convor extension icons (16/48/128 px PNG placeholders).

Renders a rounded square in the brand accent green with a white speech-bubble
mark — the live-chat vernacular. Runs at 8x supersampling then downsamples for
crisp edges at the small sizes the toolbar/store need.

Usage: python3 scripts/generate-icons.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

# Brand accent — must match --accent in popup.html / options.html.
ACCENT = (0, 163, 122, 255)      # #00a37a
ACCENT_DEEP = (0, 122, 92, 255)  # #007a5c, for a subtle bottom shade
WHITE = (255, 255, 255, 255)

SIZES = (16, 48, 128)
SUPER = 8  # supersampling factor

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"


def rounded_square(size: int, radius: int, color) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=color)
    return img


def speech_bubble(size: int) -> Image.Image:
    """A centered rounded speech bubble with a small tail, alpha mask."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Body: a rounded rectangle occupying the upper ~70% of the canvas.
    margin = int(size * 0.22)
    body_top = margin
    body_bottom = int(size * 0.66)
    radius = int(size * 0.16)
    draw.rounded_rectangle(
        (margin, body_top, size - margin, body_bottom),
        radius=radius,
        fill=WHITE,
    )

    # Tail: a small triangle off the bottom-left of the body.
    tail_top = body_bottom - int(size * 0.02)
    tail_h = int(size * 0.18)
    x_left = margin + int(size * 0.06)
    draw.polygon(
        [
            (x_left, tail_top),
            (x_left + int(size * 0.20), tail_top),
            (x_left, tail_top + tail_h),
        ],
        fill=WHITE,
    )

    # Three dots inside the bubble ("typing" indicator = chat).
    dot_r = max(1, int(size * 0.045))
    cy = (body_top + body_bottom) // 2
    spacing = int(size * 0.14)
    start_x = size // 2 - spacing
    for i in range(3):
        cx = start_x + i * spacing
        draw.ellipse(
            (cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r),
            fill=ACCENT,
        )
    return img


def render(size: int) -> Image.Image:
    big = size * SUPER
    # Background: rounded square. Add a vertical gradient for a touch of depth
    # without looking like a generic AI gradient wash.
    bg = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    radius = int(big * 0.22)
    top = rounded_square(big, radius, ACCENT)
    bottom = rounded_square(big, radius, ACCENT_DEEP)
    # Blend top 55% / bottom 45% via a simple alpha composite of a masked fade.
    mask = Image.new("L", (big, big), 0)
    mdraw = ImageDraw.Draw(mask)
    for y in range(big):
        # 0 at top -> 255 at bottom
        t = y / max(1, big - 1)
        mdraw.line([(0, y), (big, y)], fill=int(255 * t))
    bg.paste(top, (0, 0), top)
    bg.paste(bottom, (0, 0), mask)

    bubble = speech_bubble(big)
    bg.alpha_composite(bubble)

    return bg.resize((size, size), Image.LANCZOS)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        img = render(size)
        out = OUT_DIR / f"icon-{size}.png"
        img.save(out, "PNG")
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
