// Only a plain size reaches the hero's style attribute: a value from a plan is data, not CSS.
const SIZE = /^(?!.*url\()(?:\d+(?:\.\d+)?(?:px|rem|em|vh|%)|(?:clamp|calc|min|max)\([\d\s.,+*/()a-z%-]+\))$/

export const size = (value: string | undefined): string | undefined => (value && SIZE.test(value) ? value : undefined)
