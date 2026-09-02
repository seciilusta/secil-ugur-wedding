# Venue illustration — canonical source

Do not reference source files from the website. The website loads the
art-directed derivatives one directory up (`public/artwork/`).

| File | What it is |
| --- | --- |
| `wedding-illustration-master.png` | **Canonical master.** The supplied 1024×1536 RGBA venue watercolour, byte-for-byte copied into the project. |
| `venue-illustration-original.jpg` | Legacy flattened input retained for archive purposes only. Never used by the site or pipeline. |
| `venue-illustration.png` | Legacy recovered-alpha derivative retained for archive purposes only. Never used by the site or pipeline. |

## Source-of-truth rule

`wedding-illustration-master.png` is the only source of truth. It already has a
real alpha channel, so no background recovery, colour correction or sharpening
is performed.

The asset pipeline performs only:

- destination-specific cropping,
- Lanczos scaling,
- placement on transparent canvases,
- lossless WebP encoding.

The illustration is never recoloured, filtered, sharpened, vectorised, traced,
redrawn, regenerated or retouched.

## Regenerating the display copies

```bash
pnpm --filter web artwork
```

## Replacing the illustration

See "Replace the venue illustration" in the root `README.md`.
