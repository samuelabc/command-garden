export type PollOutcome = 'ready' | 'died' | 'timeout';

export async function pollUntilReady(opts: {
  checkReady: () => Promise<boolean>;
  isAlive: () => boolean;
  maxAttempts: number;
  intervalMs: number;
}): Promise<PollOutcome> {
  for (let i = 0; i < opts.maxAttempts; i++) {
    if (!opts.isAlive()) return 'died';
    if (await opts.checkReady()) return 'ready';
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  return 'timeout';
}
