# Exopus · ExoClass

Concept landing page: ExoClass sold as a helper you hire (Exopus, the after-school admin octopus), not another system you buy. Meta Muse-style: character in his own world, live status, task console, approval before anything sensitive.

**Style studio** (🎨 button, bottom right): 5 characters × 8 colours × light/dark. The URL keeps the combo, e.g. `?s=linas&c=robotika&t=dark`. Add `&studio=0` to hide the panel.

Status: concept, 2026-09-25. Not a live ExoClass feature.

**3D (v2, 2026-09-25):** hero is a real-time three.js stage. Models from Meshy (4 from Sep 23 + Linas's character via image-to-3D), optimized with gltf-transform (meshopt + WebP, ~0.4–0.7 MB each). Octopuses are unrigged, so the motion is procedural: a vertex shader ripples each of the 8 arms by angle, the body floats/hops/squashes, and on a task he turns the matching arm to the front while its job token lights up. Colour = hue rotation in the shader, same as the 2D swatches. Drag to spin. Palette follows exoclass.lt (#AE4197 · #0A0A0A · peach/apricot/cream/lavender gradients), fonts Fredoka + Plus Jakarta Sans.
