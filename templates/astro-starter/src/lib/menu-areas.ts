/**
 * Which menus a site area shows. Imports nothing, so a test can compile it on its own (`starter-menu-areas.test.ts`).
 */

/**
 * A theme location that is the header's. Themes name it `header`, `primary`, `main`, `menu-1` or `top`, or after it:
 * `header-menu`, `main-menu`, `primary_navigation`. A footer's or a top bar's never is: a theme's `topbar-menu` holds
 * account links, not the site's navigation. Keep in step with the importer's header-location rule.
 */
function isHeaderLocation(location: string): boolean {
  return /^(?:header|primary|main|menu-1|top)$/.test(location) || (/header|primary|main/i.test(location) && !/footer|top[-_]?bar/i.test(location))
}

const AREAS = {
  header: isHeaderLocation,
  footer: (location: string) => location.startsWith('footer'),
} as const

export type MenuArea = keyof typeof AREAS

/**
 * The menus an area shows, as WordPress places them: a menu assigned to theme locations shows where they are, so
 * moving or unassigning it in Studio moves it on the site; a menu with no location shows where site.config names it.
 * The header is site.config's primary menu whenever one has that slug, whatever its locations: the migration chose it
 * from the theme's locations already. Only without one does the header read the locations.
 */
export function placedIn<M extends { data: { slug: string, locations?: readonly string[] | null | undefined } }>(area: MenuArea, menus: readonly M[], configured: readonly string[]): M[] {
  const primary = area === 'header' ? menus.find(menu => menu.data.slug === configured[0]) : undefined
  if (primary) return [primary]
  return menus.filter(menu => (menu.data.locations?.length ? menu.data.locations.some(AREAS[area]) : configured.includes(menu.data.slug)))
}
