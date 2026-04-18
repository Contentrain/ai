/**
 * Emit a uniform "capability not available" response for tools that
 * require local filesystem access but are being driven by a remote
 * provider (HTTP + GitHubProvider at the moment). The agent can use
 * `capability_required` to decide whether to retry against a different
 * transport or surface the limitation to the user.
 */
export function capabilityError(tool: string, capability: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      error: `${tool} requires local filesystem access.`,
      capability_required: capability,
      hint: 'This tool is unavailable when MCP is driven by a remote provider (e.g. GitHubProvider). Use a LocalProvider or the stdio transport.',
    }) }],
    isError: true as const,
  }
}
