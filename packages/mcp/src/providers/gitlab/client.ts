import type { Gitlab } from '@gitbeaker/rest'

/**
 * Type alias for a `Gitlab` instance from `@gitbeaker/rest`.
 *
 * Provider code operates against this narrow surface so callers can
 * pass a fully constructed gitbeaker client, a carefully faked one for
 * unit tests, or an instance created by {@link createGitLabClient} in
 * `factory.ts`. The import is type-only so the runtime dependency
 * stays a pure optional peer.
 */
export type GitLabClient = InstanceType<typeof Gitlab>
