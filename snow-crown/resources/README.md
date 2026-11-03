# Visual resources for Snow Crown

The [Waterscape resource catalog](https://github.com/boxwrench/waterscape/blob/main/resources/README.md)
is useful for this Roblox project. Its asset-authoring and visual-review
methods transfer especially well. Three.js/WebGPU rendering code needs a
Roblox implementation; exported geometry and supported textures can travel
between tools.

This shortlist was prepared on 2026-11-03 from Waterscape revision
[`6e25dd0`](https://github.com/boxwrench/waterscape/blob/6e25dd0c0d349d585e4ee14ff99cb68658f2309e/resources/README.md).
It records references, not installed dependencies or completed integrations.
Waterscape's usage labels and performance estimates are not Snow Crown results.

## Start with these

| Reference | Useful part | Roblox adaptation |
| --- | --- | --- |
| [vgpu Blender asset guide](https://github.com/vercel-labs/vgpu/blob/canary/skills/vgpu/blender/index.md) | References, blockout, silhouette review, baking and export | Later, author a crown, board, rocks or a small prop kit in Blender. Check scale, pivots and materials after import into Studio. Use the asset workflow without adopting its WebGPU runtime. |
| [Kelingking visual-development workflow](https://github.com/Sam1983Aing/kelingking/blob/main/teach/03-starter-prompt.md) | Fixed comparison cameras, shape before polish, one visible correction per iteration | Save a few reproducible Studio camera views. Compare the same views after each change, including the intended gameplay view. Adapt the review method rather than the tropical setting. |
| [ez-tree](https://github.com/dgreenheck/ez-tree) and [SeedThree](https://github.com/SkyeShark/SeedThree) | Procedural vegetation authoring | ez-tree supports GLB export. Import a selected mesh/LOD through Studio; verify leaf alpha and materials. Generator-specific wind, shaders and LOD switching need separate Roblox behavior. SeedThree is an alternative to investigate, not a second required tool. |
| [ambientCG](https://ambientcg.com/) and [Poly Haven](https://polyhaven.com/) | Ground and rock texture sources | Choose a small CC0 material set. Use supported PBR maps through SurfaceAppearance or MaterialVariant; do not expect displacement maps to create mesh detail automatically. Record the exact asset URL and terms when used. |
| [ThreeBrowser Studio](https://github.com/SamG-Coder/ThreeBrowserStudio) | Optional persistent authoring viewport, matched renders and GLB export | Can help prepare or inspect assets before import. Its full native runtime currently targets Windows x64. Keep final gameplay and rendering verification in Roblox Studio; the browser preview does not provide its full MCP runtime. |

[Napali](https://github.com/Leonxlnx/napali) adds useful contact-sheet and
repeatable-shot ideas. [Procedural Alpine Lake](https://github.com/Leonxlnx/procedural-alpine-lake)
is a visual reference for alpine silhouettes, grouped conifers and atmospheric
depth. The catalog found no license for the latter: study its appearance;
do not copy its code, artwork or other files without permission.

## Use Roblox for the runtime

- [The 3D Importer](https://create.roblox.com/docs/studio/importer) handles
  supported mesh formats and materials. Validate each exported asset there;
  a good Blender or browser render does not establish Roblox compatibility.
- [SurfaceAppearance and mesh materials](https://create.roblox.com/docs/parts/meshes),
  Lighting/Atmosphere, and [particles, trails and beams](https://create.roblox.com/docs/effects)
  are useful native building blocks for snow, depth, spray and ability effects.
- Water solvers, custom GLSL/WGSL/CUDA shaders, path tracers and browser lighting
  engines in the catalog are technique references. They are not drop-in Roblox
  components. Water and detailed snow deformation remain deferred by the blueprint.
- Measure the imported scene in Studio on target devices. Upstream cinematic
  renders and browser timings do not establish game performance.

Every upstream resource keeps its own license, including reference photographs
and bundled assets. A catalog listing is not permission to redistribute them.
No upstream assets have been copied or tools installed by this guide.

## A small local-agent loop

Plateau 0 remains active. Reference planning is available now; new gameplay or
scene construction still follows the gate in [STATUS.md](../docs/STATUS.md).

1. Pick one bounded task and two or three relevant references. Read selected
   sections rather than sending the entire catalog and repositories to a model.
2. Record the intended visible result, source links, supported output format
   and comparison cameras. Leave unchosen art direction as a proposal.
3. Once the appropriate milestone is open, create a simple asset or scene
   blockout, import it and capture the agreed Studio views.
4. Review those images, correct one concrete problem, then repeat the same
   shots. Record actual findings and measured costs.

[Studio MCP](https://create.roblox.com/docs/studio/mcp) provides screen capture
and playtest tools once connected. Captures must be inspected before claiming
a visual improvement. The current Python worker sends text only; it cannot
see images, open linked pages, drive Blender or operate Studio. Visual review
needs a vision-capable local agent with image inputs, or screenshots reviewed
with the user/Codex.

The current Studio MCP also lists `store_image` and `generate_procedural_model`
for building primitive-part models from reference images. This is an optional
Studio-side path to evaluate later; it is not implemented by our text helper,
and using a local agent does not establish that connected generation services
run locally or are free.

For a short text-only preparation task, configure the local endpoint using
[LOCAL_WORKER.md](../docs/LOCAL_WORKER.md), then run from `snow-crown/`:

```sh
python tools/local_worker.py propose --job jobs/visual-reference-plan.json
```

The job drafts only `docs/VISUAL_REFERENCE_PLAN.md`. Review the proposal using
the worker's `show` and `apply` commands. This job has not been run against a
real local model here.
