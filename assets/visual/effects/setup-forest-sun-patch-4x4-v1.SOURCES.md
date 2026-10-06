# Setup Forest Sun Patch Sprite 4x4 v1

This is a candidate ambient sprite for the Setup forest's existing `sun-patch` layer. The runtime plays its 4-by-4 cells as a slow ping-pong loop and holds the first frame when the user prefers reduced motion.

- Source: original image generated and refined with the built-in ImageGen tool on 2026-10-06.
- Dimensions: 1448 × 1086 pixels, RGBA PNG, 1,645,400 bytes.
- Use: low-opacity background light only; it does not contain trees, UI, characters, or world geometry.
- Reference use: follows GAMEROAD's broad warm light patch and low-detail forest rules. No external game screenshot or third-party model was used as image input.
- License note: this is an original generated candidate, not a third-party CC0 asset. This file makes no separate public-domain or CC0 claim. Keep this provenance with any reuse.

## Final generation prompt

Use case: stylized-concept
Asset type: transparent looping ambient VFX sprite sheet for a Japanese game forest background
Primary request: revise the referenced sprite sheet into a quiet 4-by-4 looping animation of one broad diffuse patch of warm sunlight softly shifting behind leaves. Remove the many tiny bright specks and high-frequency mottling; use only a few large low-contrast leaf-shadow masses. Keep the patch broad, soft-edged, and subtle enough behind UI. Frame 1 and frame 16 should visually match for a seamless loop.
Scene/backdrop: humid Japanese summer forest shade, with a single broad warm sun opening
Subject: only one soft light patch per cell and its gently changing large shadow shapes
Style/medium: painterly, low-contrast game-background overlay, natural soft blending
Composition/framing: exact four equal columns and rows, stable same-scale patch in every frame, centered consistently; no visible grid lines, borders, dividers, or separators
Lighting/mood: restrained warm daylight through a canopy, calm
Color palette: muted yellow-green and soft amber; no white-hot center
Materials/textures: only broad leaf-shadow gradients; preserve a genuinely transparent alpha outside the light
Constraints: preserve actual transparency, retain the 4x4 sprite sheet, keep background detail sparse, keep frame composition aligned, no tree silhouettes or foliage objects
Avoid: tiny bright dots, glitter, sparkles, fireflies, particles, confetti, many sun flecks, high contrast, hard edges, lens flare, vivid saturated yellow, any UI/text/logo/watermark, path/fence/bench/building
