# spritegen

Offline sprite generation: drives local ComfyUI, extracts frames, packs sheets.

**Not runtime.** Output is committed; games never invoke this.

See [../../docs/ART-PIPELINE.md](../../docs/ART-PIPELINE.md) for the pipeline
and the models it uses.

## Status

Not yet implemented. Planned entry points:

| Script | Purpose |
| --- | --- |
| `animate.py` | H3 `ref2v`/`fl2v` → frames for one animation clip |
| `still.py` | Flux 2 Klein → a single still (horde variant, icon, card art) |
| `pack.py` | Alpha cut, trim, pack frames into a sheet + clip metadata |

Intermediate frames go to `out/` (gitignored). Finished sheets are written to
`games/<game>/assets/sheets/` and committed.
