/**
 * Open a URL in the user's default browser (best-effort, platform-aware).
 */
export async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process')

  const command = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`

  return new Promise((resolve) => {
    exec(command, () => {
      // Best-effort — resolve regardless of result
      resolve()
    })
  })
}
