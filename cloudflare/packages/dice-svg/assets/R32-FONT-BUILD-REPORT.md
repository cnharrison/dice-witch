# Dice Witch r32 font build

- Status: PASS
- Official sources and family-specific OFL files downloaded with `gh api` at pinned commits.
- Variable axes instantiated as approved; all renderer/UI subsets preserve source timestamps.
- Two complete builds produced byte-identical renderer/UI hashes.
- Validation: exact cmap checks, full table parsing, core browser/name table checks, and `ttx -l` all passed.
- Alcarin exception: upstream lacks U+2212; approved U+002D is retained without cmap modification.

## Reports

- `R32-FONT-SHA256SUMS` — source, license, instance, and output SHA-256 manifest
- `R32-FONT-GLYPH-COVERAGE.md` — expected and actual cmap coverage
- `R32-FONT-SUBSETS.md` — exact commands, versions, and pinned source revisions
- `R32-FONT-TTX-TABLES.txt` — `ttx -l` output for every subset
- `R32-FONT-DETERMINISM-1.sha256` / `R32-FONT-DETERMINISM-2.sha256` — identical-build evidence

## Repository mapping

Renderer outputs were copied byte-for-byte into this directory with `-renderer.ttf` renamed to `-subset.ttf`. UI outputs retain their build filenames under `frontend/src/assets/fonts/appearance/`.

## Output filenames

- `renderer/AlcarinTengwar-Bold-renderer.ttf`
- `renderer/BarlowCondensed-SemiBold-renderer.ttf`
- `renderer/BricolageGrotesque-SemiBold-renderer.ttf`
- `renderer/Cinzel-SemiBold-renderer.ttf`
- `renderer/Fraunces-SemiBold-renderer.ttf`
- `renderer/SourceSans3-SemiBold-renderer.ttf`
- `renderer/SpaceGrotesk-SemiBold-renderer.ttf`
- `renderer/ZillaSlab-SemiBold-renderer.ttf`
- `ui/BarlowCondensed-SemiBold-ui.ttf`
- `ui/BricolageGrotesque-SemiBold-ui.ttf`
- `ui/Cinzel-SemiBold-ui.ttf`
- `ui/Fraunces-SemiBold-ui.ttf`
- `ui/SourceSans3-SemiBold-ui.ttf`
- `ui/SpaceGrotesk-SemiBold-ui.ttf`
- `ui/ZillaSlab-SemiBold-ui.ttf`
