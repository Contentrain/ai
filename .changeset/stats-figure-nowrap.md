---
"@contentrain/astro-kit": patch
---

`stats` keeps a figure with its prefix and suffix on one line ("99.9%" no longer breaks into "99.9" / "%" in a narrow card). In a grid, the figure's size is capped by its cell and its character count, so a long figure ("1.250+", "€12.5M") shrinks to fit the card; a short one keeps the size `valueSize` gives it. The inline layout only stops wrapping a figure.
