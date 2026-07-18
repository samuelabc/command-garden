// Browser shim for node:fs — readToken() in shared/daemon-client.ts
// imports readFileSync but is never called in the chrome extension.
export function readFileSync(): never {
  throw new Error('node:fs is not available in browser extensions');
}
