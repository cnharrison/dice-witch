# Liberation Sans renderer subset

`LiberationSans-Bold-subset.ttf` is a deterministic subset of `LiberationSans-Bold.ttf` containing the only text glyphs used by the renderer: `0123456789d?-+`.

The retained source font is Liberation Fonts 2.1.5 from the Arch Linux `ttf-liberation` 2.1.5-2 package. It was copied from `/usr/share/fonts/liberation/LiberationSans-Bold.ttf`.

Source SHA-256:

```text
769673c4355020b1e28a14c366a152da410ab6b16239fe883ebc35b73624835b  LiberationSans-Bold.ttf
```

Subset SHA-256:

```text
84e0eacb34b8b79137c7f1521dd8de8171ca88b3ea287aae5edec1ba046bad6f  LiberationSans-Bold-subset.ttf
```

Regenerate with FontTools 4.63.0:

```bash
pyftsubset LiberationSans-Bold.ttf \
  --text='0123456789d?-+' \
  --output-file=LiberationSans-Bold-subset.ttf \
  --glyph-names \
  --symbol-cmap \
  --legacy-cmap \
  --notdef-glyph \
  --notdef-outline \
  --recommended-glyphs \
  --name-IDs='*' \
  --name-legacy \
  --name-languages='*' \
  --no-recalc-timestamp
```

The source and subset remain covered by `LIBERATION-LICENSE.txt` (SIL Open Font License 1.1).
