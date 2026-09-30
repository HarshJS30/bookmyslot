# Drop your licensed font files here

These four fonts are commercial (paid) typefaces  I couldn't source or
bundle the actual font files, only set up the project to use them by
name. Once you add your own licensed files with these exact filenames,
they'll be picked up automatically with no code changes:

| Font (as you specified)     | Foundry            | Expected filenames in this folder                                                          |
|------------------------------|---------------------|----------------------------------------------------------------------------------------------|
| Dirty Sundae Bold             | Fenotype            | `DirtySundae-Bold.woff2`, `DirtySundae-Bold.woff`, `DirtySundae-Bold.otf`                   |
| ITC Mixage Std Bold           | ITC                 | `ITCMixageStd-Bold.woff2`, `ITCMixageStd-Bold.woff`, `ITCMixageStd-Bold.otf`                 |
| Schelter Grotesk NF           | Nick's Fonts        | `SchelterGroteskNF-Regular.woff2`, `SchelterGroteskNF-Regular.woff`, `SchelterGroteskNF-Regular.otf` |
| Equitan Sans                  | Indian Type Foundry | `EquitanSans-Regular.woff2`, `EquitanSans-Regular.woff`, `EquitanSans-Regular.otf`           |

You don't need all three formats per font  `.woff2` alone is fine for
modern browsers. Just keep the base filename (before the extension)
exact, since that's what `app/globals.css` references in the
`@font-face` rules.

The heading currently falls back to Dirty Sundae Bold → ITC Mixage Std
Bold → sans-serif, and body text falls back to Schelter Grotesk NF →
Equitan Sans → sans-serif. Until real files are added, you'll see the
sans-serif fallback  that's expected, not a bug.
