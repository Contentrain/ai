export function branchTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}
