# Commands and versions

- OS/Python: Linux-6.8.0-90-generic-x86_64-with-glibc2.39 / 3.12.3
- FontTools: 4.46.0 (Ubuntu package `python3-fonttools` 4.46.0-1build2, extracted locally under this build directory)
- GitHub CLI: gh version 2.97.0 (2026-07-31)
- Google Fonts commit: `038b637da7b3fd956a4ed93ffc607c3d5e4ce172`
- Alcarin-Tengwar commit: `a4530d430ea01871b0b0a54d1de218d2ffde0ea5`

## Local FontTools setup

```bash
mkdir -p /tmp/dw-r32-font-build/tools
cd /tmp/dw-r32-font-build/tools
apt-get download python3-fonttools
dpkg-deb -x python3-fonttools_*.deb extracted
export PYTHONPATH=/tmp/dw-r32-font-build/tools/extracted/usr/lib/python3/dist-packages
```

## Exact asset build commands

The executable build was run twice, and output hashes were compared with `diff`.

```bash
#!/bin/bash
set -euo pipefail

ROOT=/tmp/dw-r32-font-build
PYTHONPATH="$ROOT/tools/extracted/usr/lib/python3/dist-packages"
export PYTHONPATH
GOOGLE_SHA=038b637da7b3fd956a4ed93ffc607c3d5e4ce172
ALCARIN_SHA=a4530d430ea01871b0b0a54d1de218d2ffde0ea5

mkdir -p "$ROOT"/{sources,licenses,instances,renderer,ui}

fetch_google() {
  local remote_path=$1 output=$2
  gh api -H 'Accept: application/vnd.github.raw' \
    "/repos/google/fonts/contents/${remote_path}?ref=${GOOGLE_SHA}" > "$output"
}

fetch_alcarin() {
  local remote_path=$1 output=$2
  gh api -H 'Accept: application/vnd.github.raw' \
    "/repos/Tosche/Alcarin-Tengwar/contents/${remote_path}?ref=${ALCARIN_SHA}" > "$output"
}

fetch_google 'ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf' "$ROOT/sources/SourceSans3[wght].ttf"
fetch_google 'ofl/sourcesans3/OFL.txt' "$ROOT/licenses/SourceSans3-OFL.txt"
fetch_google 'ofl/cinzel/Cinzel%5Bwght%5D.ttf' "$ROOT/sources/Cinzel[wght].ttf"
fetch_google 'ofl/cinzel/OFL.txt' "$ROOT/licenses/Cinzel-OFL.txt"
fetch_google 'ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf' "$ROOT/sources/BarlowCondensed-SemiBold.ttf"
fetch_google 'ofl/barlowcondensed/OFL.txt' "$ROOT/licenses/BarlowCondensed-OFL.txt"
fetch_google 'ofl/zillaslab/ZillaSlab-SemiBold.ttf' "$ROOT/sources/ZillaSlab-SemiBold.ttf"
fetch_google 'ofl/zillaslab/OFL.txt' "$ROOT/licenses/ZillaSlab-OFL.txt"
fetch_google 'ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf' "$ROOT/sources/SpaceGrotesk[wght].ttf"
fetch_google 'ofl/spacegrotesk/OFL.txt' "$ROOT/licenses/SpaceGrotesk-OFL.txt"
fetch_google 'ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf' "$ROOT/sources/Fraunces[SOFT,WONK,opsz,wght].ttf"
fetch_google 'ofl/fraunces/OFL.txt' "$ROOT/licenses/Fraunces-OFL.txt"
fetch_google 'ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf' "$ROOT/sources/BricolageGrotesque[opsz,wdth,wght].ttf"
fetch_google 'ofl/bricolagegrotesque/OFL.txt' "$ROOT/licenses/BricolageGrotesque-OFL.txt"
fetch_alcarin 'Fonts%20Static/AlcarinTengwar-Bold.ttf' "$ROOT/sources/AlcarinTengwar-Bold.ttf"
fetch_alcarin 'OFL.txt' "$ROOT/licenses/AlcarinTengwar-OFL.txt"

instantiate() {
  python3 -m fontTools.varLib.instancer "$@" --no-recalc-timestamp
}

instantiate "$ROOT/sources/SourceSans3[wght].ttf" wght=600 -o "$ROOT/instances/SourceSans3-SemiBold.ttf"
instantiate "$ROOT/sources/Cinzel[wght].ttf" wght=600 -o "$ROOT/instances/Cinzel-SemiBold.ttf"
instantiate "$ROOT/sources/SpaceGrotesk[wght].ttf" wght=600 -o "$ROOT/instances/SpaceGrotesk-SemiBold.ttf"
instantiate "$ROOT/sources/Fraunces[SOFT,WONK,opsz,wght].ttf" SOFT=50 WONK=1 opsz=72 wght=600 -o "$ROOT/instances/Fraunces-SemiBold.ttf"
instantiate "$ROOT/sources/BricolageGrotesque[opsz,wdth,wght].ttf" opsz=48 wdth=90 wght=600 -o "$ROOT/instances/BricolageGrotesque-SemiBold.ttf"

subset() {
  local input=$1 output=$2 unicodes=$3
  python3 -m fontTools.subset "$input" \
    --output-file="$output" \
    --unicodes="$unicodes" \
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

RENDERER_ORDINARY='U+002B,U+0030-0039,U+2212'
subset "$ROOT/instances/SourceSans3-SemiBold.ttf" "$ROOT/renderer/SourceSans3-SemiBold-renderer.ttf" "$RENDERER_ORDINARY"
subset "$ROOT/instances/Cinzel-SemiBold.ttf" "$ROOT/renderer/Cinzel-SemiBold-renderer.ttf" "$RENDERER_ORDINARY"
subset "$ROOT/sources/BarlowCondensed-SemiBold.ttf" "$ROOT/renderer/BarlowCondensed-SemiBold-renderer.ttf" "$RENDERER_ORDINARY"
subset "$ROOT/sources/ZillaSlab-SemiBold.ttf" "$ROOT/renderer/ZillaSlab-SemiBold-renderer.ttf" "$RENDERER_ORDINARY"
subset "$ROOT/instances/SpaceGrotesk-SemiBold.ttf" "$ROOT/renderer/SpaceGrotesk-SemiBold-renderer.ttf" "$RENDERER_ORDINARY"
subset "$ROOT/instances/Fraunces-SemiBold.ttf" "$ROOT/renderer/Fraunces-SemiBold-renderer.ttf" "$RENDERER_ORDINARY"
subset "$ROOT/instances/BricolageGrotesque-SemiBold.ttf" "$ROOT/renderer/BricolageGrotesque-SemiBold-renderer.ttf" "$RENDERER_ORDINARY"
subset "$ROOT/sources/AlcarinTengwar-Bold.ttf" "$ROOT/renderer/AlcarinTengwar-Bold-renderer.ttf" 'U+002B,U+002D,U+E070-E079'

subset "$ROOT/instances/SourceSans3-SemiBold.ttf" "$ROOT/ui/SourceSans3-SemiBold-ui.ttf" 'U+0020,U+0033,U+0053,U+0061,U+0063,U+0065,U+006E,U+006F,U+0072,U+0073,U+0075'
subset "$ROOT/instances/Cinzel-SemiBold.ttf" "$ROOT/ui/Cinzel-SemiBold-ui.ttf" 'U+0043,U+0065,U+0069,U+006C,U+006E,U+007A'
subset "$ROOT/sources/BarlowCondensed-SemiBold.ttf" "$ROOT/ui/BarlowCondensed-SemiBold-ui.ttf" 'U+0020,U+0042,U+0043,U+0061,U+0064,U+0065,U+006C,U+006E,U+006F,U+0072,U+0073,U+0077'
subset "$ROOT/sources/ZillaSlab-SemiBold.ttf" "$ROOT/ui/ZillaSlab-SemiBold-ui.ttf" 'U+0020,U+0053,U+005A,U+0061,U+0062,U+0069,U+006C'
subset "$ROOT/instances/SpaceGrotesk-SemiBold.ttf" "$ROOT/ui/SpaceGrotesk-SemiBold-ui.ttf" 'U+0020,U+0047,U+0053,U+0061,U+0063,U+0065,U+006B,U+006F,U+0070,U+0072,U+0073,U+0074'
subset "$ROOT/instances/Fraunces-SemiBold.ttf" "$ROOT/ui/Fraunces-SemiBold-ui.ttf" 'U+0046,U+0061,U+0063,U+0065,U+006E,U+0072,U+0073,U+0075'
subset "$ROOT/instances/BricolageGrotesque-SemiBold.ttf" "$ROOT/ui/BricolageGrotesque-SemiBold-ui.ttf" 'U+0020,U+0042,U+0047,U+0061,U+0063,U+0065,U+0067,U+0069,U+006C,U+006F,U+0071,U+0072,U+0073,U+0074,U+0075'
```

## Exact validation commands

```bash
export PYTHONPATH=/tmp/dw-r32-font-build/tools/extracted/usr/lib/python3/dist-packages
python3 /tmp/dw-r32-font-build/validate_and_report.py
find renderer ui -type f -name '*.ttf' -print0 | sort -z | xargs -0 sha256sum
diff -u determinism-run-1.sha256 determinism-run-2.sha256
python3 -m fontTools.ttx -l SUBSET.ttf  # run for every renderer and UI subset; captured in ttx-tables.txt
sha256sum -c SHA256SUMS
```
