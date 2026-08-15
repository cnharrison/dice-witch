# Dice Witch r37 JetBrains Mono font build

## Pinned source

- Repository: `JetBrains/JetBrainsMono`
- Commit: `19371302b95d218af43299bce79ddbddd0bc364d`
- Font: `fonts/ttf/JetBrainsMono-SemiBold.ttf`
- Font SHA-256: `12d4b18fe6e1af528e4bea69cb0997aeff22f9e52fccffcf66342dd88aa32ab8`
- License: `OFL.txt`, copied to `JetBrainsMono-OFL.txt`
- License: SIL Open Font License 1.1

## Build environment

- OS/Python: Linux 6.8 / Python 3.12.3
- FontTools: 4.46.0 from Ubuntu package `python3-fonttools` 4.46.0-1build2

```bash
mkdir -p /tmp/dw-r37-font-build/{sources,licenses,renderer,ui,tools}
cd /tmp/dw-r37-font-build

gh api -H 'Accept: application/vnd.github.raw' \
  '/repos/JetBrains/JetBrainsMono/contents/fonts/ttf/JetBrainsMono-SemiBold.ttf?ref=19371302b95d218af43299bce79ddbddd0bc364d' \
  > sources/JetBrainsMono-SemiBold.ttf
gh api -H 'Accept: application/vnd.github.raw' \
  '/repos/JetBrains/JetBrainsMono/contents/OFL.txt?ref=19371302b95d218af43299bce79ddbddd0bc364d' \
  > licenses/JetBrainsMono-OFL.txt

cd tools
apt-get download python3-fonttools=4.46.0-1build2
dpkg-deb -x python3-fonttools_4.46.0-1build2_amd64.deb extracted
cd ..
export PYTHONPATH=/tmp/dw-r37-font-build/tools/extracted/usr/lib/python3/dist-packages

subset() {
  python3 -m fontTools.subset sources/JetBrainsMono-SemiBold.ttf \
    --output-file="$1" \
    --unicodes="$2" \
    --layout-features='*' \
    --glyph-names \
    --symbol-cmap \
    --legacy-cmap \
    --name-IDs='*' \
    --name-legacy \
    --name-languages='*' \
    --no-recalc-timestamp \
    --canonical-order
}

subset renderer/JetBrainsMono-SemiBold-subset.ttf \
  'U+002B,U+0030-0039,U+2212'
subset ui/JetBrainsMono-SemiBold-ui.ttf \
  'U+0020,U+0042,U+004A,U+004D,U+0061,U+0065,U+0069,U+006E,U+006F,U+0072,U+0073,U+0074'
```

## Verified outputs

| Output | Bytes | Glyphs | Exact cmap |
| --- | ---: | ---: | --- |
| Renderer | 15,244 | 85 | U+002B, U+0030–U+0039, U+2212 |
| UI | 9,204 | 20 | U+0020, U+0042, U+004A, U+004D, U+0061, U+0065, U+0069, U+006E, U+006F, U+0072, U+0073, U+0074 |

Both builds retained source naming and timestamps, parsed successfully with `TTFont` and `ttx`, and produced byte-identical hashes in two independent output directories. A third run using the commands above matched the repository assets byte-for-byte.

Repository mapping:

- Renderer: `cloudflare/packages/dice-svg/assets/JetBrainsMono-SemiBold-subset.ttf`
- UI: `frontend/src/assets/fonts/appearance/JetBrainsMono-SemiBold-ui.ttf`
- License: `cloudflare/packages/dice-svg/assets/JetBrainsMono-OFL.txt`
