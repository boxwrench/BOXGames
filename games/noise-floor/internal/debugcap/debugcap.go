// Package debugcap is a debug-only, opt-in GPU screenshot hook. It exists
// because the dev box is a Wayland session where external screen capture
// tools (import, ffmpeg) only see a blank Xwayland root, so the engine's own
// GPU-side capture is the only way to see what the game renders. It has no
// effect unless explicitly armed via an environment variable, and is not part
// of the shipping game loop.
package debugcap

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"io"
	"log/slog"
	"os"

	"kaijuengine.com/engine"
	"kaijuengine.com/rendering"
)

// Arm registers a one-shot capture. When the NOISEFLOOR_CAPTURE environment
// variable is set to a non-empty path, the game renders `frames` frames, writes
// a PNG of the last presented frame to that path, and then closes the host.
// When the variable is empty or unset, Arm does nothing and the game runs
// normally.
func Arm(host *engine.Host, frames int) {
	path := os.Getenv("NOISEFLOOR_CAPTURE")
	if path == "" {
		return
	}
	host.RunAfterFrames(frames, func() {
		host.RunOnRenderThread(func(device *rendering.GPUDevice) {
			pixels, err := device.ScreenshotRGBA()
			if err != nil {
				slog.Error("debugcap: screenshot failed", "error", err)
				return
			}
			w, h := host.Window.Width(), host.Window.Height()
			f, err := os.Create(path)
			if err != nil {
				slog.Error("debugcap: failed to create capture file", "path", path, "error", err)
				return
			}
			defer f.Close()
			if err := encodePNG(f, pixels, w, h); err != nil {
				slog.Error("debugcap: failed to encode capture", "path", path, "width", w, "height", h, "error", err)
				return
			}
			slog.Info("debugcap: wrote capture", "path", path, "width", w, "height", h)
			host.Close()
		})
	})
}

// encodePNG builds an RGBA image from pixels (in canonical R,G,B,A byte
// order, row-major) and encodes it as a PNG to w. pixels must be exactly
// width*height*4 bytes; a mismatch in either direction means the caller's
// dimensions are wrong and the image would be misaligned, so it is treated as
// an error rather than silently truncated or overrun.
func encodePNG(w io.Writer, pixels []byte, width, height int) error {
	want := width * height * 4
	if len(pixels) != want {
		return fmt.Errorf("debugcap: pixel slice length %d does not match width*height*4 (%d)", len(pixels), want)
	}
	img := &image.RGBA{
		Pix:    pixels,
		Stride: width * 4,
		Rect:   image.Rect(0, 0, width, height),
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return fmt.Errorf("debugcap: png encode failed: %w", err)
	}
	_, err := w.Write(buf.Bytes())
	return err
}
