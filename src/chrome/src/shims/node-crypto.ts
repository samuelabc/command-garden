// Browser shim for node:crypto used by @commandgarden/shared
export function randomUUID(): string {
  return crypto.randomUUID();
}
