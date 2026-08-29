# Art pipeline

All generation is **offline**. `tools/spritegen` drives local ComfyUI and
writes committed sprite sheets; games build and run with no ComfyUI present and
no diffusion models on disk. No model inference happens at runtime.

## Source art

`/ai/github/boxwrench` is the style bible, not a scratch folder:

| Asset | What |
| --- | --- |
| `public/images/concepts/pose sheet cel.PNG` | Six-angle cel turnaround of BX-77 |
| `public/images/concepts/{full,3-4,back} stance.PNG` | Alpha-cut single stances |
| `public/images/concepts/wrench-knight-headshot-3k.png` | 3K headshot |
| `public/images/lore/*.webp` | Six lore illustrations |
| `src/ds/tokens/colors.css` | The eight armor-sampled palette tokens |
| `styles.txt` | The nine sanctioned style registers |

BX-77 is **rigid armor** — every plate rotates at joints and nothing deforms.
That constrains what motion is plausible and makes inter-frame drift
especially visible: a rivet that crawls reads instantly as wrong.

## Models on disk

| Model | Use |
| --- | --- |
| MiniMax H3 `ref2v` | Reference image → motion. Keeps the character the character. |
| MiniMax H3 `fl2v` | First+last frame → video. Same image for both yields a seamless loop. |
| H3 turbo LoRAs | 4-step and 8-step sampling |
| Flux 2 Klein 9B (Q8 GGUF) | Stills: horde variants, bosses, icons, card art |
| `80sFantasyKlein9b` LoRA | Close to the lore's "1980s retro-futuristic robotics" |
| RIFE 4.26 | Frame interpolation / resampling to a target count |
| SeedVR2 | Restoration before packing |

GPU[1] has 34 GB, so the int8/fp8 H3 builds (~20 GB) fit comfortably.

## Why video, not stills, for animation

Per-frame still generation draws independent samples, so high-frequency detail
drifts between frames — rivets crawl, the cape rehangs, the crest wobbles. That
artifact is worst on exactly what BX-77 is made of.

A video model's entire job is temporal consistency, which makes it the right
tool. Two properties matter:

- **`ref2v`** seeds from an existing stance, so the character is preserved
  rather than reinvented per frame.
- **`fl2v`** takes a first *and* last frame. Passing **the same image for both**
  produces a seamless loop — the exact requirement for idle and walk cycles,
  solved structurally rather than by hand-fixing the wrap.

## Pipeline

```
source stance ──▶ H3 ref2v / fl2v ──▶ RIFE resample ──▶ SeedVR2 clean
                                                             │
                            alpha cut ◀── trim ◀── pack ◀─────┘
                                 │
                                 ▼
              games/<game>/assets/sheets/*.png  +  clip metadata
                                 │
                    scripts/build-content.sh (flatten)
                                 ▼
                     games/<game>/content/  (generated)
```

Sheets and clip metadata are committed. Intermediate frames are not —
`tools/spritegen/out/` is gitignored.

## Known constraint

Crimson noise entities with dark cores become nearly invisible against ink once
the corruption field inverts beneath them. Horde art needs a value treatment
that survives the ground flipping from cream to ink — a light/emissive variant
that engages as local corruption rises, or a permanent light rim.

Decide this **before** generating a full horde, or all of it needs regenerating.
