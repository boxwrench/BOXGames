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

Colour: shapes are drawn in OPAQUE WHITE (255, 255, 255), not pre-coloured.
The colour comes from the runtime tint (actorColor in Go) applied via the
multiplicative shader: texture * tint. A white atlas is neutral, yielding
the tint directly -- ink tints give ink, paper tints give paper. A pre-baked
ink atlas cannot work with a value treatment. Background is fully transparent.

Outlines: each shape is surrounded by a 1px ring in mid-grey (128, 128, 128).
Because the shader multiplies, a white body takes the tint fully; a mid-grey
outline takes half of it. This means the outline always renders at half the
body's luminance -- darker than the body when the actor is light (on paper),
still distinct when the actor is dark (on ink) -- guaranteeing a hard edge
even at the crossfade midpoint where the body fades to mid-value ground.

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

# Opaque white: atlas is neutral, colour comes from runtime tint. See
# module docstring.
WHITE = (255, 255, 255, 255)

# Outline in mid-grey: multiplied by tint, this yields half luminance,
# sitting between body and ground even at the crossfade midpoint.
# See module docstring.
GREY = (128, 128, 128, 255)

FRAME = 32
FRAMES_PER_CLIP = 4
FPS = 8
OUT_DIR = Path(__file__).resolve().parents[2] / "games" / "noise-floor" / "assets" / "sheets"


def _canvas():
    return Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))


def _add_outline(img):
    """Add a 1px mid-grey outline to an opaque white shape.

    Scans the image for transparent pixels that are orthogonally adjacent
    (up, down, left, right) to opaque white pixels, and sets them to opaque
    mid-grey. This creates a hard-edged outline ring without eating into
    the shape's body.
    """
    pixels = img.load()
    w, h = img.size

    # Build a list of pixels to outline (transparent pixels adjacent to white).
    # Do this in two passes to avoid painting while iterating.
    to_outline = set()
    for y in range(h):
        for x in range(w):
            # Only outline transparent pixels
            if pixels[x, y][3] == 0:  # alpha == 0
                # Check orthogonal neighbors for opaque white
                for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        neighbor = pixels[nx, ny]
                        # Is the neighbor opaque white?
                        if neighbor[3] == 255 and neighbor[:3] == (255, 255, 255):
                            to_outline.add((x, y))
                            break

    # Paint outlines
    for x, y in to_outline:
        pixels[x, y] = GREY

    return img


def _player_chevron(t):
    """Player marker: a tall, narrow upward-pointing arrowhead, pulsing slightly frame to frame."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    cx, cy = FRAME / 2, FRAME / 2
    # Tall narrow triangle pointing up
    height = 12 + 1.2 * math.sin(t * math.pi / 2)  # ~10.8..13.2px pulse
    width = 5 + 0.5 * math.sin(t * math.pi / 2)    # ~4.5..5.5px pulse
    pts = [
        (cx, cy - height),          # top point
        (cx + width, cy + height),  # bottom-right
        (cx - width, cy + height),  # bottom-left
    ]
    d.polygon(pts, fill=WHITE)
    return img


def _mote(t):
    """Mote: a small circle -- the tiniest archetype."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    r = 6 + 1.5 * math.sin(t * math.pi / 2)
    cx = cy = FRAME / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    return img


def _dendrite(t, spikes=7):
    """Dendrite: a spiky radial burst."""
    img = _canvas()
    d = ImageDraw.Draw(img)
    cx = cy = FRAME / 2
    inner = 4
    # 12.5 (not the original 14) is the largest base radius whose peak
    # frame (t=1, where the +1.5 sway is at its max) still leaves a 1px
    # transparent margin on all four canvas edges once _add_outline's
    # ring is added. See task-9a-report.md for the derivation.
    outer = 12.5 + 1.5 * math.sin(t * math.pi / 2)
    pts = []
    for i in range(spikes * 2):
        ang = math.pi * i / spikes + t * 0.15
        r = outer if i % 2 == 0 else inner
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.polygon(pts, fill=WHITE)
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
    d.polygon(pts, fill=WHITE)
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
    d.polygon(pts, fill=WHITE)
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
        d.ellipse([cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr], fill=WHITE)
    return img


# name -> per-frame drawing function. Names match the actor archetypes
# (games/noise-floor/internal/actor/doc.go) plus "player".
ARCHETYPES = {
    "player": _player_chevron,
    "mote": _mote,
    "dendrite": _dendrite,
    "aberrant": _aberrant,
    "lancer": _lancer,
    "overfit": _overfit,
}


def build_strip(draw_fn):
    """Render FRAMES_PER_CLIP frames into one horizontal strip atlas."""
    frames = [draw_fn(t) for t in range(FRAMES_PER_CLIP)]
    # Add outlines to each frame
    frames = [_add_outline(frame) for frame in frames]
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
