// Node stand-in for the workerd-only "cloudflare:workers" module, so modules that import it
// (the tenant Durable Object, the OAuth provider) load under vitest. Tests that need behaviour
// still mock it themselves.
export class DurableObject {}
export class WorkerEntrypoint {}
