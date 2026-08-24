// Legacy CSS quarantine (the fidelity layer).
//
// Migrated pages must render pixel-identically, and a utility framework's
// preflight/reset would fight the theme's CSS. The truce is a cascade layer:
// every legacy stylesheet is wrapped in `@layer legacy { … }`, and modern CSS
// lives in its own layer — the two never meet in specificity.
//
// One CSS rule constrains the wrapping: `@import` (and `@charset`) must
// precede all other statements, so a file cannot simply be wrapped whole.
// Leading imports are hoisted above the wrapper and given `layer(legacy)`;
// an import *after* other rules is already invalid CSS that browsers ignore,
// so the file is left unwrapped and a warning recorded instead of silently
// producing different invalidity.

import { LEGACY_CSS_LAYER } from '@contentrain/types'

export interface WrapCssResult {
  content: string
  warning?: string
}

const LEADING = /^(\s*(?:@charset[^;]+;|@import[^;]+;|\/\*[\s\S]*?\*\/)\s*)+/

export function wrapLegacyCss(path: string, css: string): WrapCssResult {
  const rest = css.replace(LEADING, '')
  if (/@import\s/.test(rest)) {
    return {
      content: css,
      warning: `${path}: @import after other rules — left unwrapped (fix the source stylesheet; mid-file imports are ignored by browsers)`,
    }
  }
  const leading = css.slice(0, css.length - rest.length)
  const hoisted = leading.replace(/@import\s+([^;]+);/g, (full, spec: string) =>
    /\blayer\s*\(/.test(spec) ? full : `@import ${spec.trim()} layer(${LEGACY_CSS_LAYER});`,
  )
  return { content: `${hoisted}@layer ${LEGACY_CSS_LAYER} {\n${rest}\n}\n` }
}
