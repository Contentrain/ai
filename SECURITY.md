# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in a Contentrain package, report it privately to:

- [security@contentrain.io](mailto:security@contentrain.io)

Do not open public GitHub issues for security reports.

Please include:

- The affected package and version
- A clear description of the issue
- Reproduction steps or a proof of concept
- Impact and exploitation prerequisites
- Your suggested fix, if you have one

## Scope

### In Scope

- Every package published from this repository under `packages/`
- The MCP server's tools, transports (stdio and HTTP), and Git providers
- Path handling, file writes, and Git operations performed on a user's repository
- The CLI's local Serve UI
- Generated code written by `contentrain generate`

### Out of Scope

- Vulnerabilities in third-party dependencies that should be reported upstream first
- Issues in GitHub, GitLab, AI clients, or other vendor platforms themselves
- Contentrain Studio: report those through [Contentrain/studio](https://github.com/Contentrain/studio/blob/main/SECURITY.md)
- Local development-only weaknesses that cannot affect a real project

## Response Targets

| Stage | Target |
| --- | --- |
| Acknowledgment | Within 48 hours |
| Initial triage | Within 5 business days |
| Critical / High remediation target | Within 30 days |
| Medium / Low remediation target | Best effort, usually in a scheduled release |

These are targets, not guarantees.

## Supported Versions

Security fixes ship in the latest published version of each package. Older versions are not patched; upgrade to the latest release.
