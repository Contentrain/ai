// Reads the PoC-1 experiment directory in place: the 272 punch items of 22
// cohort run reports, the 40 hand labels, and the answers jev-1.13.0 gave.
// The directory names real sites, so it lives outside this repository and is
// never copied into it — point CONTENTRAIN_DECIDE_POC1_DIR at it.
//
// Items come back in PoC-1's order (site by site, item by item), which is the
// order PoC-1 sent them in. `expected` is set on the 40 labelled items.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))

/** @type {import('./poc1.d.mts').loadPoc1} */
export function loadPoc1(dir) {
  const inventory = read(dir, 'inventory.json')
  const labels = new Map(read(dir, 'manual-labels.json').labels.map(l => [`${l.site}#${l.itemIndex}`, { class: l.class, severity: l.severity }]))
  const answers = new Map()
  for (const [site, result] of Object.entries(read(dir, 'results-batched.json'))) {
    for (const chunk of result.results) {
      const got = chunk.response.answers
      for (let n = 1; got[`item${n}_class`]; n++) {
        answers.set(`${site}#${chunk.itemOffset + n - 1}`, {
          class: got[`item${n}_class`],
          severity: got[`item${n}_severity`],
          needs_human: got[`item${n}_needs_human`],
        })
      }
    }
  }
  const bySite = new Map()
  for (const item of inventory) bySite.set(item.site, [...(bySite.get(item.site) ?? []), item])
  return [...bySite.values()].flat().map((item) => {
    const id = `${item.site}#${item.itemIndex}`
    const loaded = {
      site: item.site,
      input: {
        label: item.label,
        reason: item.reason,
        link: item.link || undefined,
        site: { name: item.site, url: item.siteUrl, decision: item.decision, median: item.median, mobile_median: item.mobileMedian },
      },
      answers: answers.get(id),
    }
    if (labels.has(id)) loaded.expected = labels.get(id)
    return loaded
  })
}
