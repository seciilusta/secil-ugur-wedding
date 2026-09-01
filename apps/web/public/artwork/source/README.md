# Venue illustration — source files

Do not reference these files from the website. They are the archival originals.
The website loads the optimized copies one directory up (`public/artwork/`).

| File | What it is |
| --- | --- |
| `venue-illustration-original.jpg` | The illustration exactly as it was delivered. Never edited. |
| `venue-illustration.png` | Lossless master with the alpha channel restored. Full canvas, nothing cropped. |

## Why there are two masters

The illustration is a transparent watercolour rendering of Aden Boğazköy Tesisleri.
The file that reached this repository had been flattened onto a pure black
background, so it arrived as a JPEG with no alpha channel.

Flattening over black is a premultiplication, which is exactly invertible, so
`scripts/optimize-artwork.mjs` rebuilds the alpha channel instead of altering the
artwork:

1. A flood fill starting at the canvas border claims only near-black pixels
   (luma < 14) as background. Because the dark glass structure is enclosed by the
   bright watercolour wash, the fill cannot reach it, so it stays fully opaque.
2. The three-pixel band just inside the fill is the anti-aliased wash edge. Its
   alpha is recovered from luma and its colour is un-premultiplied, which keeps the
   soft ragged watercolour boundary instead of a hard dark outline.
3. Fully empty outer padding is measured and trimmed. Nothing visible is cropped,
   so the visible artwork keeps its original proportions.

The illustration is never vectorised, traced, redrawn, regenerated or retouched.

## Regenerating the display copies

```bash
pnpm --filter web artwork
```

## Replacing the illustration

See "Replace the venue illustration" in the root `README.md`.
