package debugcap

import (
	"bytes"
	"image/color"
	"image/png"
	"testing"
)

// makePixels builds a deterministic w*h RGBA buffer where pixel i has
// R=i, G=i+1, B=i+2, A=255 (mod 256), so each pixel's color is distinct and
// verifiable after a round trip through PNG.
func makePixels(w, h int) []byte {
	pixels := make([]byte, w*h*4)
	for i := 0; i < w*h; i++ {
		o := i * 4
		pixels[o+0] = byte(i)
		pixels[o+1] = byte(i + 1)
		pixels[o+2] = byte(i + 2)
		pixels[o+3] = 255
	}
	return pixels
}

func TestEncodePNGRoundTripsPixels(t *testing.T) {
	const w, h = 4, 2
	pixels := makePixels(w, h)

	var buf bytes.Buffer
	if err := encodePNG(&buf, pixels, w, h); err != nil {
		t.Fatalf("encodePNG() error = %v, want nil", err)
	}
	if buf.Len() == 0 {
		t.Fatalf("encodePNG() wrote no bytes")
	}

	img, err := png.Decode(&buf)
	if err != nil {
		t.Fatalf("png.Decode() error = %v", err)
	}
	b := img.Bounds()
	if got, want := b.Dx(), w; got != want {
		t.Fatalf("decoded width = %v, want %v", got, want)
	}
	if got, want := b.Dy(), h; got != want {
		t.Fatalf("decoded height = %v, want %v", got, want)
	}

	// Check pixel at (1, 0): that's index i=1 in row-major order (index =
	// y*w+x = 0*4+1 = 1), so expected R=1, G=2, B=3, A=255.
	got := color.NRGBAModel.Convert(img.At(1, 0)).(color.NRGBA)
	want := color.NRGBA{R: 1, G: 2, B: 3, A: 255}
	if got != want {
		t.Fatalf("pixel (1,0) = %+v, want %+v", got, want)
	}
}

func TestEncodePNGRejectsShortPixelSlice(t *testing.T) {
	const w, h = 4, 2
	pixels := makePixels(w, h)[:len(makePixels(w, h))-1] // one byte short

	var buf bytes.Buffer
	err := encodePNG(&buf, pixels, w, h)
	if err == nil {
		t.Fatalf("encodePNG() error = nil, want error for short pixel slice")
	}
	if buf.Len() != 0 {
		t.Fatalf("encodePNG() wrote %d bytes on error, want 0", buf.Len())
	}
}

func TestEncodePNGRejectsLongPixelSlice(t *testing.T) {
	const w, h = 4, 2
	pixels := append(makePixels(w, h), 0xFF) // one byte too many

	var buf bytes.Buffer
	err := encodePNG(&buf, pixels, w, h)
	if err == nil {
		t.Fatalf("encodePNG() error = nil, want error for long pixel slice")
	}
	if buf.Len() != 0 {
		t.Fatalf("encodePNG() wrote %d bytes on error, want 0", buf.Len())
	}
}

func TestCaptureFrames(t *testing.T) {
	const fallback = 30
	tests := []struct {
		name string
		env  string
		want int
	}{
		{"empty string falls back", "", fallback},
		{"valid positive number is used", "360", 360},
		{"zero falls back", "0", fallback},
		{"negative number falls back", "-5", fallback},
		{"non-numeric string falls back", "banana", fallback},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := captureFrames(tt.env, fallback); got != tt.want {
				t.Fatalf("captureFrames(%q, %d) = %d, want %d", tt.env, fallback, got, tt.want)
			}
		})
	}
}
