#!/usr/bin/env python3
"""Placeholder sprite-sheet generator for NOISE FLOOR.

TEMPORARY. Real art is meant to come from tools/spritegen once it is
implemented (see tools/spritegen/PLAN.md) driving ComfyUI, which is not
running today. This script exists only so the enemy task has something to
draw, and to prove shared/spritesheet's LoadAtlas agrees with something real
on disk. Delete this script's output -- or the whole script -- once real art
lands for these archetypes.

Emits the shared/spritesheet JSON schema (see
.superpowers/sdd/2026-08-29-noise-floor-phase2/task-6-brief.md):

    {
      "image": "<name>.png",
      "atlas": {"w": .., "h": ..},
      "clips": {"idle": {"fps": .., "loop": true,
                          "frames": [{"x":.., "y":.., "w":.., "h":..}, ...]}}
    }

Rects are in atlas pixels with a TOP-LEFT origin, exactly as
shared/spritesheet.LoadAtlas expects -- no pre-normalisation, no pre-flip.

Colour: fill is INK, taken from shared/palette/palette.go's HexInk
(0x17161B); this script is Python, not Go, and cannot import that package,
so the value is copied here as a literal -- if HexInk ever changes there,
eyeball this too. Background is fully transparent, no second colour.

Silhouette constraint (binding, see task-6 brief): the player and every
enemy archetype share a value range in-game (both crossfade ink->paper with
local corruption) and can only be told apart by silhouette. So every shape
here is a genuinely different outline -- this script never reaches for
colour to distinguish archetypes, only shape. Archetype names (mote,
dendrite, aberrant, lancer, overfit) match games/noise-floor/internal/actor's
doc comment.
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

# Sourced from shared/palette/palette.go: HexInk. Kept as a literal -- see
# module docstring.
INK = (0x17, 0x16, 0x1B, 255)

FRAME = 32
FRAMES_PER_CLIP = 4
FPS = 8
OUT_DIR = Path(__file__).resolve().parents[2] / "games" / "noise-floor" / "assets" / "sheets"


def _canvas():
    return Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))


def _centered_square(t):
    """Player marker: a square, pulsing slightly frame to frame."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    side = 16 + 2 * math.sin(t * math.pi / 2)  # ~14..18px pulse
    half = side / 2
    cx = cy = FRAME / 2
    d.rectangle([cx - half, cy - half, cx + half, cy + half], fill=INK)
    return img


def _mote(t):
    """Mote: a small circle -- the tiniest archetype."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    r = 6 + 1.5 * math.sin(t * math.pi / 2)
    cx = cy = FRAME / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)
    return img


def _dendrite(t, spikes=7):
    """Dendrite: a spiky radial burst."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    cx = cy = FRAME / 2
    inner = 4
    outer = 14 + 1.5 * math.sin(t * math.pi / 2)
    pts = []
    for i in range(spikes * 2):
        ang = math.pi * i / spikes + t * 0.15
        r = outer if i % 2 == 0 else inner
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.polygon(pts, fill=INK)
    return img


def _aberrant(t):
    """Aberrant: a single irregular, lopsided blob."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    cx = cy = FRAME / 2
    base_r = [9, 12, 8, 13, 10, 14, 9, 11]
    pts = []
    n = len(base_r)
    for i, r0 in enumerate(base_r):
        ang = 2 * math.pi * i / n
        r = r0 + 1.5 * math.sin(t * math.pi / 2 + i)
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.polygon(pts, fill=INK)
    return img


def _lancer(t):
    """Lancer: a long spear-like bar."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    cx, cy = FRAME / 2, FRAME / 2
    length = 26 + 1.5 * math.sin(t * math.pi / 2)
    width = 5
    half_l, half_w = length / 2, width / 2
    pts = [
        (cx, cy - half_l),  # tip
        (cx + half_w, cy - half_l * 0.3),
        (cx + half_w * 0.6, cy + half_l),
        (cx - half_w * 0.6, cy + half_l),
        (cx - half_w, cy - half_l * 0.3),
    ]
    d.polygon(pts, fill=INK)
    return img


def _overfit(t):
    """Overfit: a dense cluster of overlapping lobes -- the heaviest archetype."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    cx, cy = FRAME / 2, FRAME / 2
    pulse = 1.0 + 0.08 * math.sin(t * math.pi / 2)
    lobes = [(0, 0, 9), (-7, -5, 6), (7, -5, 6), (-6, 7, 6), (6, 7, 6), (0, -9, 5)]
    for ox, oy, r in lobes:
        rr = r * pulse
        d.ellipse([cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr], fill=INK)
    return img


# name -> per-frame drawing function. Names match the actor archetypes
# (games/noise-floor/internal/actor/doc.go) plus "player".
ARCHETYPES = {
    "player": _centered_square,
    "mote": _mote,
    "dendrite": _dendrite,
    "aberrant": _aberrant,
    "lancer": _lancer,
    "overfit": _overfit,
}


def build_strip(draw_fn):
    """Render FRAMES_PER_CLIP frames into one horizontal strip atlas."""
    frames = [draw_fn(t) for t in range(FRAMES_PER_CLIP)]
    atlas = Image.new("RGBA", (FRAME * FRAMES_PER_CLIP, FRAME), (0, 0, 0, 0))
    rects = []
    for i, frame in enumerate(frames):
        atlas.paste(frame, (i * FRAME, 0), frame)
        rects.append({"x": i * FRAME, "y": 0, "w": FRAME, "h": FRAME})
    return atlas, rects


def sheet_doc(name, rects):
    return {
        "image": f"{name}.png",
        "atlas": {"w": FRAME * FRAMES_PER_CLIP, "h": FRAME},
        "clips": {
            "idle": {"fps": FPS, "loop": True, "frames": rects},
        },
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, draw_fn in ARCHETYPES.items():
        atlas, rects = build_strip(draw_fn)
        png_path = OUT_DIR / f"{name}.png"
        json_path = OUT_DIR / f"{name}.png.json"
        atlas.save(png_path)
        json_path.write_text(json.dumps(sheet_doc(name, rects), indent=2) + "\n")
        print(f"wrote {png_path} ({atlas.size[0]}x{atlas.size[1]}) and {json_path}")


if __name__ == "__main__":
    main()
