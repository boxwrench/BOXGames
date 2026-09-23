# spritegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline tool that drives local ComfyUI to generate temporally-consistent BX-77 animation frames, cuts them to alpha, packs them into an atlas, and emits engine-compatible clip metadata.

**Architecture:** A Python CLI that submits API-format graphs to ComfyUI over HTTP, polls for completion, downloads the resulting video, then does all frame extraction, alpha cutting, trimming and packing locally with ffmpeg and Pillow. Nothing here runs at game time; output is committed.

**Tech Stack:** Python 3 (`/ai/environments/comfyui-h3/bin/python`) · stdlib `urllib` + polling · ffmpeg · Pillow · ComfyUI HTTP API · MiniMax H3 (`ref2v`, `fl2v`) · Flux 2 Klein 9B

**Spec:** [`../../docs/ART-PIPELINE.md`](../../docs/ART-PIPELINE.md) and [`../../games/noise-floor/docs/specs/2026-08-29-noise-floor-design.md`](../../games/noise-floor/docs/specs/2026-08-29-noise-floor-design.md) §6

**Companion plan:** [`../../games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md`](../../games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md) defines the sheet format this tool must emit and runs on placeholder art until this lands.

## Global Constraints

- **Never launch ComfyUI from tool code.** The server is started by hand via `/ai/scripts/minimax-h3/h3.sh`. The tool connects to an already-running server and fails with a clear message if it is not up.
- **Server default is `127.0.0.1:8188`.** Port 8190 belongs to a separate dual-GPU experiment; do not hardcode it. Make the address configurable, defaulting to 8188.
- **GPU selection is `HIP_VISIBLE_DEVICES=1`** (the 34 GB card), set in `/ai/lab/experiments/minimax-h3/env/common.env`. That choice is deliberate and documented as verified against `rocminfo`, not Vulkan ordering. The tool never overrides it.
- **API format, not UI format.** `POST /prompt` accepts a flat `{"<node_id>": {"class_type": ..., "inputs": {...}}}` dict. The UI's save format (`nodes`/`links`) is rejected. Linked inputs are `["<source_node_id>", <output_slot>]`.
- **The venv has no `websocket-client` and no `pip`.** Use stdlib `urllib` with polling on `/history/{prompt_id}`, matching the existing working driver at `/ai/github/R9700/scripts/execute-showcase-session.py`. `requests` and `aiohttp` are available if needed.
- **RIFE and background removal are NOT installed as ComfyUI nodes.** A `rife4.26.pkl` exists on disk but no node loads it. Frame resampling and alpha cutting happen in our Python, not in a graph.
- **Emit the engine's JSON sheet schema** (see below). Pixel rects, top-left origin, no pre-normalisation, no pre-flip.
- **Output naming:** `<name>.png` atlas beside `<name>.png.json` metadata — the one convention the engine actually exercises.
- **Intermediates are disposable.** Frames and downloaded video go to `tools/spritegen/out/` (gitignored). Only finished sheets are committed.

## Reference material on disk

| Path | What |
| --- | --- |
| `/ai/github/R9700/production/workflows/h3_r2v.json` | Working **API-format** H3 ref2v graph — the template to start from |
| `/ai/github/R9700/scripts/execute-showcase-session.py` | Working ComfyUI driver: queue, poll `/history`, locate outputs |
| `/ai/comfyui/script_examples/websockets_api_example.py` | Reference client shipped with ComfyUI |
| `/ai/comfyui/custom_nodes/ComfyUI-ALLinONE-MinimaxH3/workflows/` | Canonical H3 graphs (UI format — Export (API) to use) |
| `/ai/scripts/minimax-h3/h3.sh` | How the server is launched |

### Node classes

| Purpose | Class | Key inputs |
| --- | --- | --- |
| Diffusion model | `UNETLoader` | `unet_name`, `weight_dtype` |
| Text encoder | `CLIPLoader` | `clip_name`, `type="minimax"` (H3) / `"flux2"` (Klein) |
| VAE (image + audio) | `VAELoader` ×2 | `vae_name` |
| LoRA | `LoraLoader` / `LoraLoaderModelOnly` | `lora_name`, `strength_model` |
| Reference image | `LoadImage` | `image` (filename in ComfyUI `input/`; upload via `POST /upload/image`) |
| **ref2v** | `MiniMaxH3ReferenceToVideo` | `clip`, `vae`, `audio_vae`, `prompt`, `width`, `height`, `length`, `ref_images` |
| **fl2v** | `MiniMaxH3ImageToVideo` | `clip`, `vae`, `prompt`, `width`, `height`, `length`, `first_frame`, `last_frame` |
| Sampling | `RandomNoise`, `KSamplerSelect`, `BasicScheduler`, `BasicGuider`, `SamplerCustomAdvanced` | |
| Decode | `VAEDecode`, `VAEDecodeAudio` | |
| Output | `CreateVideo` → `SaveVideo` | `filename_prefix`, `format`, `codec` |

**The loop trick:** `MiniMaxH3ImageToVideo` with the *same image* passed to both `first_frame` and `last_frame` yields a seamless cycle — the structural fix for idle and walk loops.

---

## Task 1: ComfyUI client

The foundation. Everything else is a graph plus this transport.

**Files:**
- Create: `tools/spritegen/comfy.py`
- Test: `tools/spritegen/test_comfy.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `class ComfyError(Exception)`, `class ComfyClient`, `ComfyClient(address="127.0.0.1:8188")`, `.is_up() -> bool`, `.queue(graph: dict, client_id: str|None) -> str`, `.wait(prompt_id: str, timeout: float) -> dict`, `.outputs(history: dict) -> list[dict]`, `.download(entry: dict, dest: pathlib.Path) -> pathlib.Path`, `.upload_image(path) -> str`.

- [ ] **Step 1: Write the failing test**

Tests run with no server, against a stub HTTP server on a loopback port, so they never depend on ComfyUI being up.

```python
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from comfy import ComfyClient, ComfyError


class StubHandler(BaseHTTPRequestHandler):
    """Minimal stand-in for the ComfyUI endpoints we use."""
    history_completed = True

    def log_message(self, *args):
        pass  # keep test output clean

    def do_POST(self):
        if self.path == "/prompt":
            length = int(self.headers["Content-Length"])
            body = json.loads(self.rfile.read(length))
            assert "prompt" in body, "client must send the graph under 'prompt'"
            self._json({"prompt_id": "abc123", "number": 1, "node_errors": {}})
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path.startswith("/history/"):
            if not self.history_completed:
                self._json({})  # not finished yet
                return
            self._json({"abc123": {
                "status": {"status_str": "success", "completed": True},
                "outputs": {"15": {"images": [
                    {"filename": "out_0001.png", "subfolder": "", "type": "output"}
                ]}},
            }})
        elif self.path.startswith("/view"):
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.end_headers()
            self.wfile.write(b"PNGDATA")
        elif self.path == "/system_stats":
            self._json({"system": {}})
        else:
            self.send_error(404)

    def _json(self, obj):
        payload = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class ComfyClientTest(unittest.TestCase):
    def setUp(self):
        self.server = HTTPServer(("127.0.0.1", 0), StubHandler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        host, port = self.server.server_address
        self.client = ComfyClient(address=f"{host}:{port}")

    def tearDown(self):
        self.server.shutdown()

    def test_is_up(self):
        self.assertTrue(self.client.is_up())

    def test_queue_returns_prompt_id(self):
        self.assertEqual(self.client.queue({"1": {"class_type": "X", "inputs": {}}}), "abc123")

    def test_wait_returns_history(self):
        hist = self.client.wait("abc123", timeout=5)
        self.assertTrue(hist["status"]["completed"])

    def test_outputs_flattens_entries(self):
        hist = self.client.wait("abc123", timeout=5)
        entries = self.client.outputs(hist)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["filename"], "out_0001.png")

    def test_download_writes_file(self):
        import tempfile, pathlib
        hist = self.client.wait("abc123", timeout=5)
        entry = self.client.outputs(hist)[0]
        with tempfile.TemporaryDirectory() as d:
            path = self.client.download(entry, pathlib.Path(d) / "got.png")
            self.assertEqual(path.read_bytes(), b"PNGDATA")

    def test_is_up_false_when_server_absent(self):
        dead = ComfyClient(address="127.0.0.1:1")  # nothing listens on port 1
        self.assertFalse(dead.is_up())


class ComfyClientTimeoutTest(unittest.TestCase):
    def test_wait_raises_on_timeout(self):
        StubHandler.history_completed = False
        self.addCleanup(setattr, StubHandler, "history_completed", True)
        server = HTTPServer(("127.0.0.1", 0), StubHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        host, port = server.server_address
        client = ComfyClient(address=f"{host}:{port}", poll_interval=0.01)
        with self.assertRaises(ComfyError):
            client.wait("abc123", timeout=0.1)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /ai/github/BOXGames/tools/spritegen && /ai/environments/comfyui-h3/bin/python -m unittest test_comfy -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'comfy'`.

- [ ] **Step 3: Write the implementation**

Create `tools/spritegen/comfy.py`:

```python
"""Minimal ComfyUI HTTP client.

Follows the polling pattern of the working driver at
/ai/github/R9700/scripts/execute-showcase-session.py rather than the websocket
API, because the comfyui-h3 venv has no websocket-client installed.

This module never starts ComfyUI. The server is launched by hand via
/ai/scripts/minimax-h3/h3.sh.
"""

import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

DEFAULT_ADDRESS = "127.0.0.1:8188"


class ComfyError(Exception):
    """Raised when ComfyUI is unreachable, rejects a graph, or a run fails."""


class ComfyClient:
    def __init__(self, address=DEFAULT_ADDRESS, poll_interval=0.5):
        self.address = address
        self.poll_interval = poll_interval

    def _url(self, path, query=None):
        url = f"http://{self.address}{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        return url

    def _get_json(self, path, query=None):
        with urllib.request.urlopen(self._url(path, query)) as r:
            return json.loads(r.read().decode())

    def is_up(self):
        """True when a ComfyUI server answers on this address."""
        try:
            self._get_json("/system_stats")
            return True
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            return False

    def require_up(self):
        if not self.is_up():
            raise ComfyError(
                f"No ComfyUI server at {self.address}. "
                "Start it by hand:  /ai/scripts/minimax-h3/h3.sh"
            )

    def queue(self, graph, client_id=None):
        """Submit an API-format graph. Returns the prompt id.

        graph is the flat {node_id: {class_type, inputs}} form. The UI's
        nodes/links save format is rejected by the server.
        """
        payload = {"prompt": graph, "client_id": client_id or str(uuid.uuid4())}
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            self._url("/prompt"), data=data,
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                body = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            raise ComfyError(f"ComfyUI rejected the graph ({e.code}): {detail}") from e
        if "prompt_id" not in body:
            raise ComfyError(f"No prompt_id in response: {body}")
        return body["prompt_id"]

    def wait(self, prompt_id, timeout=1800):
        """Poll /history until the run completes. Returns its history entry."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            history = self._get_json(f"/history/{prompt_id}")
            entry = history.get(prompt_id)
            if entry:
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    raise ComfyError(f"Run failed: {status.get('messages')}")
                if status.get("completed") or entry.get("outputs"):
                    return entry
            time.sleep(self.poll_interval)
        raise ComfyError(f"Timed out after {timeout}s waiting for {prompt_id}")

    @staticmethod
    def outputs(history_entry):
        """Flatten a history entry's outputs into a list of file descriptors.

        ComfyUI groups saved files by node id and by kind (images/gifs/audio);
        callers almost always just want every file the run produced.
        """
        found = []
        for node_output in history_entry.get("outputs", {}).values():
            for kind in ("images", "gifs", "audio", "video"):
                found.extend(node_output.get(kind, []))
        return found

    def download(self, entry, dest):
        """Fetch one output file described by a /history entry."""
        dest = pathlib.Path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        query = {
            "filename": entry["filename"],
            "subfolder": entry.get("subfolder", ""),
            "type": entry.get("type", "output"),
        }
        with urllib.request.urlopen(self._url("/view", query)) as r:
            dest.write_bytes(r.read())
        return dest

    def upload_image(self, path):
        """Upload a local image into ComfyUI's input/ dir for LoadImage.

        Returns the filename LoadImage should reference.
        """
        path = pathlib.Path(path)
        boundary = f"----spritegen{uuid.uuid4().hex}"
        body = b"".join([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="image"; filename="{path.name}"\r\n'.encode(),
            b"Content-Type: application/octet-stream\r\n\r\n",
            path.read_bytes(),
            f"\r\n--{boundary}--\r\n".encode(),
        ])
        req = urllib.request.Request(
            self._url("/upload/image"), data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())["name"]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /ai/github/BOXGames/tools/spritegen && /ai/environments/comfyui-h3/bin/python -m unittest test_comfy -v`

Expected: PASS, all seven tests.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add tools/spritegen/
git commit -m "feat(spritegen): add ComfyUI HTTP client"
```

---

## Task 2: Atlas packer and sheet metadata

Deliberately before any generation: it is pure image maths, fully testable with synthetic frames, and it defines the contract the gameplay plan consumes.

**Files:**
- Create: `tools/spritegen/pack.py`
- Test: `tools/spritegen/test_pack.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `def alpha_trim(img) -> Image`, `def pack_strip(frames, columns=None) -> tuple[Image, list[tuple[int,int,int,int]]]`, `def sheet_json(clips: dict[str, list[tuple]], hold: int = 1) -> str`, `def write_sheet(atlas, clips, out_png: pathlib.Path)`.

The emitted JSON must match `sprite.NewSheetFromJson`: a top-level **array** of `{"Name", "Frames":[{"Hold","Rectangle":[x,y,w,h]}]}`, pixel rects, top-left origin.

- [ ] **Step 1: Write the failing test**

```python
import json
import pathlib
import tempfile
import unittest

from PIL import Image

from pack import alpha_trim, pack_strip, sheet_json, write_sheet


def solid(w, h, color=(255, 0, 0, 255)):
    return Image.new("RGBA", (w, h), color)


class AlphaTrimTest(unittest.TestCase):
    def test_trims_transparent_border(self):
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        img.paste(solid(10, 20), (12, 8))
        self.assertEqual(alpha_trim(img).size, (10, 20))

    def test_fully_transparent_image_is_left_alone(self):
        img = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
        # getbbox() returns None here; the function must not crash.
        self.assertEqual(alpha_trim(img).size, (8, 8))


class PackStripTest(unittest.TestCase):
    def test_single_row_layout(self):
        frames = [solid(10, 20), solid(10, 20), solid(10, 20)]
        atlas, rects = pack_strip(frames)
        self.assertEqual(atlas.size, (30, 20))
        self.assertEqual(rects, [(0, 0, 10, 20), (10, 0, 10, 20), (20, 0, 10, 20)])

    def test_uses_max_cell_size_for_ragged_frames(self):
        frames = [solid(10, 20), solid(14, 8)]
        atlas, rects = pack_strip(frames)
        self.assertEqual(atlas.size, (28, 20))  # 2 cells of 14x20
        self.assertEqual(rects[1], (14, 0, 14, 20))

    def test_wraps_into_grid_when_columns_given(self):
        frames = [solid(10, 10) for _ in range(5)]
        atlas, rects = pack_strip(frames, columns=2)
        self.assertEqual(atlas.size, (20, 30))  # 2 cols x 3 rows
        self.assertEqual(rects[4], (0, 20, 10, 10))

    def test_rejects_empty_frame_list(self):
        with self.assertRaises(ValueError):
            pack_strip([])


class SheetJSONTest(unittest.TestCase):
    def test_schema_matches_engine(self):
        doc = json.loads(sheet_json({"idle": [(0, 0, 32, 48), (32, 0, 32, 48)]}, hold=6))
        self.assertIsInstance(doc, list, "engine expects a top-level array of clips")
        self.assertEqual(doc[0]["Name"], "idle")
        self.assertEqual(doc[0]["Frames"][1]["Rectangle"], [32, 0, 32, 48])
        self.assertEqual(doc[0]["Frames"][0]["Hold"], 6)

    def test_multiple_clips_preserved(self):
        doc = json.loads(sheet_json({
            "idle": [(0, 0, 8, 8)],
            "walk": [(8, 0, 8, 8), (16, 0, 8, 8)],
        }))
        names = {c["Name"]: len(c["Frames"]) for c in doc}
        self.assertEqual(names, {"idle": 1, "walk": 2})


class WriteSheetTest(unittest.TestCase):
    def test_writes_png_and_sidecar_json(self):
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d) / "bx77.png"
            atlas, rects = pack_strip([solid(8, 8), solid(8, 8)])
            write_sheet(atlas, {"idle": rects}, out)
            self.assertTrue(out.exists())
            # Convention the engine actually exercises: <name>.png.json
            self.assertTrue(out.with_suffix(".png.json").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /ai/github/BOXGames/tools/spritegen && /ai/environments/comfyui-h3/bin/python -m unittest test_pack -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'pack'`.

- [ ] **Step 3: Write the implementation**

Create `tools/spritegen/pack.py`:

```python
"""Frame trimming, atlas packing, and engine-compatible sheet metadata.

Output format is the schema sprite.NewSheetFromJson accepts:

    [{"Name": "idle", "Frames": [{"Hold": 6, "Rectangle": [x, y, w, h]}]}]

Rectangles are ATLAS PIXELS with a TOP-LEFT origin. Do not normalise and do not
flip V here — consumers convert to GPU UVs themselves.

Uniform cells are used rather than tight packing: a survivors-like animates
hundreds of sprites and a predictable cell grid keeps frame lookup trivial and
lets the sprite pivot stay stable between frames. Tight packing would save
atlas space and cost pivot stability, which is the wrong trade.
"""

import json
import pathlib

from PIL import Image


def alpha_trim(img):
    """Crop away fully transparent borders.

    A fully transparent image has no bounding box; return it unchanged rather
    than crashing, so a blank generated frame degrades instead of aborting a run.
    """
    bbox = img.getbbox()
    if bbox is None:
        return img
    return img.crop(bbox)


def pack_strip(frames, columns=None):
    """Pack frames into a uniform-cell atlas.

    Returns (atlas_image, [(x, y, w, h), ...]) with one rect per frame, in the
    order given. Cell size is the max frame extent so every frame keeps a
    consistent centre.
    """
    if not frames:
        raise ValueError("pack_strip needs at least one frame")

    cell_w = max(f.width for f in frames)
    cell_h = max(f.height for f in frames)
    cols = columns if columns else len(frames)
    rows = (len(frames) + cols - 1) // cols

    atlas = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    rects = []
    for i, frame in enumerate(frames):
        cx, cy = (i % cols) * cell_w, (i // cols) * cell_h
        # Centre each frame in its cell so the pivot does not wander.
        ox = cx + (cell_w - frame.width) // 2
        oy = cy + (cell_h - frame.height) // 2
        atlas.paste(frame, (ox, oy))
        rects.append((cx, cy, cell_w, cell_h))
    return atlas, rects


def sheet_json(clips, hold=1):
    """Build the engine's clip metadata document.

    clips maps clip name -> list of (x, y, w, h) pixel rects.

    Note: the engine parses Hold but never honours it — playback uses one global
    fps. It is emitted for forward compatibility; our own animator in
    shared/spritesheet does respect per-clip timing.
    """
    doc = [
        {
            "Name": name,
            "Frames": [
                {"Hold": hold, "Rectangle": [int(x), int(y), int(w), int(h)]}
                for (x, y, w, h) in rects
            ],
        }
        for name, rects in clips.items()
    ]
    return json.dumps(doc, indent=2)


def write_sheet(atlas, clips, out_png, hold=1):
    """Write <name>.png and its <name>.png.json sidecar."""
    out_png = pathlib.Path(out_png)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out_png)
    sidecar = out_png.with_name(out_png.name + ".json")
    sidecar.write_text(sheet_json(clips, hold=hold))
    return out_png, sidecar
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /ai/github/BOXGames/tools/spritegen && /ai/environments/comfyui-h3/bin/python -m unittest test_pack -v`

Expected: PASS, all nine tests.

- [ ] **Step 5: Verify Pillow is available in the venv**

Run: `/ai/environments/comfyui-h3/bin/python -c "import PIL; print(PIL.__version__)"`

Expected: a version string. If it fails, use the system `python3` (Pillow 10.2.0 confirmed present there) and record which interpreter the tool requires in the README.

- [ ] **Step 6: Commit**

```bash
cd /ai/github/BOXGames
git add tools/spritegen/
git commit -m "feat(spritegen): add atlas packer and sheet metadata"
```

---

## Remaining tasks (3-6)

Specified but not yet expanded to step level. Expand each before execution.

**Task 3 — Graph templating.** Load `/ai/github/R9700/production/workflows/h3_r2v.json` as a template, and provide `build_ref2v(reference_image, prompt, width, height, length, seed)` and `build_fl2v(first, last, prompt, ...)` that return API-format graphs with those inputs substituted by node id. Test against the committed template with no server: assert the returned graph is flat, every `class_type` is present, the reference image filename landed in the `LoadImage` node, and that changing the seed changes exactly one value. Keep the template committed under `tools/spritegen/graphs/` so the tool does not depend on paths outside the repo.

**Task 4 — Frame extraction.** `extract_frames(video_path, out_dir, fps=None) -> list[Path]` shelling out to `ffmpeg` (no RIFE node exists, so any resampling is `ffmpeg`'s `fps` filter). Test with a tiny synthetic video generated by `ffmpeg` in the test itself, asserting frame count and ordering. Include a `require_ffmpeg()` preflight with a clear message.

**Task 5 — Alpha cutting.** `cut_alpha(img, bg_tolerance)` removing the flat generated background to transparency. No rembg node is installed, so this is our own: the source art sits on a near-uniform cream field, which makes a chroma-distance threshold with edge feathering viable and far cheaper than a matting model. Test on synthetic images with known backgrounds, including an anti-aliased edge case, and assert the subject's interior is never made transparent.

**Task 6 — CLI end to end.** `animate.py --clip idle --ref <png> --frames 8 --out games/noise-floor/assets/sheets/bx77.png` tying Tasks 1-5 together, plus `--dry-run` that builds and validates the graph without a server. Verify manually against a running ComfyUI, then load the resulting sheet in the game and confirm the animator plays it. This is the task that closes the loop with the gameplay plan.
