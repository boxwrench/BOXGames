#version 460
#define FRAGMENT_SHADER

#define SAMPLER_COUNT 1

#define LAYOUT_FRAG_COLOR 0
#define LAYOUT_FRAG_TEX_COORDS 1
#define LAYOUT_FRAG_FLAGS 2
#define LAYOUT_FRAG_POS 3
#define LAYOUT_FRAG_NORMAL 4

#include "kaiju.glsl"

// Entropy staining the page. The CPU-authoritative boundary arrives packed
// into fragColor: .r safe radius (world units), .gb stain quad width/height
// (world units), .a corruption level (0 clean, 1 consumed). This shader
// decorates that boundary with noise but never redefines it (spec 5.1).

const vec3 PAPER = vec3(0.957, 0.937, 0.894); // #F4EFE4
const vec3 INK   = vec3(0.090, 0.086, 0.106); // #17161B
const vec3 BRASS = vec3(0.647, 0.486, 0.200); // #A57C33
const vec3 VISOR = vec3(0.765, 0.227, 0.169); // #C33A2B

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0, 0)), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; ++i) {
        v += a * valueNoise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

// Softness of the corruption front, in world units.
const float FRONT_SOFTNESS = 0.6;

void main() {
    vec2 uv = fragTexCoords;
    float safeRadius = fragColor.r;
    vec2  quad       = fragColor.gb;          // world units
    float corruption = clamp(fragColor.a, 0.0, 1.0);

    vec2  p = (uv - 0.5) * quad;              // world offset from the arena centre
    float r = length(p);

    vec2 q = uv * 4.0;
    float drift = time * 0.06;
    float n = fbm(q + vec2(drift, -drift * 0.7));
    n = mix(n, fbm(q * 2.3 - vec2(drift * 1.7, drift)), 0.45);

    float wobble = 1.0 + (n - 0.5) * 0.10;    // +-5%, per spec 5.1
    float front  = safeRadius * wobble;
    float stain  = smoothstep(front, front + FRONT_SOFTNESS, r);

    vec3 col = mix(PAPER, INK, stain);

    // Crimson rim where the rot is actively eating.
    float rim = smoothstep(0.35, 0.5, stain) * (1.0 - smoothstep(0.5, 0.72, stain));
    col = mix(col, VISOR, rim * 0.85 * (0.35 + corruption));

    // Engraved hatch grid on clean paper, fading as it is consumed.
    vec2 g = fract(uv * 42.0);
    float hatch = min(smoothstep(0.0, 0.045, g.x), smoothstep(0.0, 0.045, g.y));
    col = mix(col, mix(col, BRASS, 0.16), (1.0 - hatch) * (1.0 - stain) * 0.55);

    // Paper tooth, so the clean field is never a flat fill.
    col += (hash(uv * 900.0) - 0.5) * 0.022 * (1.0 - stain);

    processFinalColor(vec4(col, 1.0));
}
