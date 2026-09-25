// @ts-check
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, fontProviders } from 'astro/config'
import redirects from './redirects.json' with { type: 'json' }
import { siteConfig } from './src/site.config.ts'

// The site's public address. Canonical URLs, the sitemap, RSS and JSON-LD all
// hang off it, so a migration writes the source site's own address here.
const site = 'https://example.com'

// Contentrain Studio's media delivery for this site's project only
// (`<studio>/api/cdn/v1/<project>/media/…`): images an editor uploads in Studio
// are optimized like the ones in public/. The Studio binding in site.config.ts
// names the project; CONTENTRAIN_STUDIO_URL and CONTENTRAIN_STUDIO_PROJECT
// override it. Without a project, no Studio host is allowed.
const studioUrl = process.env.CONTENTRAIN_STUDIO_URL ?? siteConfig.studio?.baseUrl
const studioProject = process.env.CONTENTRAIN_STUDIO_PROJECT ?? siteConfig.studio?.projectId
const studio = studioUrl && studioProject ? new URL(studioUrl) : undefined

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

export default defineConfig({
  site,
  // WordPress addresses end in a slash; building directories keeps every old
  // URL at the same place without a redirect.
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Old address → new address, 301. Generated from the source site's redirect
  // rules and changed permalinks; kept in a JSON file so tools can rewrite it.
  redirects,
  integrations: [sitemap()],
  image: {
    // Hosts whose images astro:assets may download and optimize at build time.
    // The source site is never one of them: its media is copied into public/.
    domains: [],
    remotePatterns: studio
      ? [{ protocol: studio.protocol.slice(0, -1), hostname: studio.hostname, ...(studio.port ? { port: studio.port } : {}), pathname: `/api/cdn/v1/${studioProject}/media/**` }]
      : [],
    responsiveStyles: true,
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Inter',
      cssVariable: '--font-inter',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        // One file per script subset: a page downloads only the ranges its
        // text uses. latin-ext covers Turkish, Polish, Czech and the like.
        variants: [
          { src: ['./src/assets/fonts/inter-latin-wght-normal.woff2'], weight: '100 900', style: 'normal', unicodeRange: [LATIN] },
          { src: ['./src/assets/fonts/inter-latin-wght-italic.woff2'], weight: '100 900', style: 'italic', unicodeRange: [LATIN] },
          { src: ['./src/assets/fonts/inter-latin-ext-wght-normal.woff2'], weight: '100 900', style: 'normal', unicodeRange: [LATIN_EXT] },
          { src: ['./src/assets/fonts/inter-latin-ext-wght-italic.woff2'], weight: '100 900', style: 'italic', unicodeRange: [LATIN_EXT] },
        ],
      },
    },
  ],
  vite: { plugins: [tailwindcss()] },
})
