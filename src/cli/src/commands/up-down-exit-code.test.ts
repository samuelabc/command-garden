// src/commands/up-down-exit-code.test.ts
//
// Covers the LifecycleStatus -> UpResult.ok mapping that both desktop launchers
// depend on. The sub-commands are mocked so each status can be driven directly:
// producing a real 'unresponsive' would require a 10s poll timeout.
// up-down.test.ts covers the same function against the real sub-commands.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./daemon-cmd.js', () => ({
  executeDaemonStart: vi.fn(),
  executeDaemonStop: vi.fn(),
}));

vi.mock('./gui-cmd.js', () => ({
  executeGuiStart: vi.fn(),
  executeGuiStop: vi.fn(),
  waitForAppAndOpen: vi.fn(),
}));

import { executeUp } from './up-down.js';
import { executeDaemonStart } from './daemon-cmd.js';
import { executeGuiStart, waitForAppAndOpen } from './gui-cmd.js';
import type { LifecycleStatus } from './lifecycle-types.js';

const ARGS = [
  'http://127.0.0.1:9091', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', 'node', '/fake/config.yaml',
] as const;

function run(): ReturnType<typeof executeUp> {
  return executeUp(...ARGS);
}

describe('executeUp exit-code mapping', () => {
  beforeEach(() => {
    vi.mocked(executeDaemonStart).mockReset();
    vi.mocked(executeGuiStart).mockReset();
    vi.mocked(waitForAppAndOpen).mockReset();
    vi.mocked(waitForAppAndOpen).mockResolvedValue({ ok: true, message: 'GUI is reachable.' });
  });

  describe('daemon status decides the result when the GUI is never reached', () => {
    const cases: Array<[LifecycleStatus, boolean]> = [
      ['failed', false],
      ['unresponsive', false],
    ];

    for (const [status, expectedOk] of cases) {
      it(`maps daemon '${status}' to ok=${expectedOk}`, async () => {
        vi.mocked(executeDaemonStart).mockResolvedValue({ status, message: `daemon ${status}` });

        const result = await run();

        expect(result.ok).toBe(expectedOk);
        expect(result.message).toContain(`daemon ${status}`);
        // None of these statuses allow the GUI stage to run.
        expect(executeGuiStart).not.toHaveBeenCalled();
      });
    }
  });

  describe('GUI status decides the result once the daemon is up', () => {
    const cases: Array<[LifecycleStatus, boolean]> = [
      ['started', true],
      ['already-running', true],
      ['failed', false],
      ['unresponsive', false],
    ];

    for (const [status, expectedOk] of cases) {
      it(`maps GUI '${status}' to ok=${expectedOk}`, async () => {
        vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'started', message: 'Daemon started.' });
        vi.mocked(executeGuiStart).mockResolvedValue({ status, message: `gui ${status}` });

        const result = await run();

        expect(result.ok).toBe(expectedOk);
        expect(result.message).toContain('Daemon started.');
        expect(result.message).toContain(`gui ${status}`);
      });
    }
  });

  describe("'locked' means another cg up is finishing the job", () => {
    it('waits for that startup and opens a browser for this invocation', async () => {
      vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'locked', message: 'daemon locked' });

      const result = await run();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('GUI is reachable.');
      expect(waitForAppAndOpen).toHaveBeenCalledWith('/fake/.cg', '/fake/config.yaml');
      expect(executeGuiStart).not.toHaveBeenCalled();
    });

    it('fails when the other startup never makes the GUI reachable', async () => {
      vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'locked', message: 'daemon locked' });
      vi.mocked(waitForAppAndOpen).mockResolvedValue({ ok: false, message: 'not reachable' });

      const result = await run();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('not reachable');
    });

    it('waits when the GUI stage is the locked one', async () => {
      vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'started', message: 'Daemon started.' });
      vi.mocked(executeGuiStart).mockResolvedValue({ status: 'locked', message: 'gui locked' });

      const result = await run();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('gui locked');
      expect(waitForAppAndOpen).toHaveBeenCalledOnce();
    });

    it('does not wait under --no-open, since no browser is expected', async () => {
      vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'locked', message: 'daemon locked' });

      const result = await executeUp(...ARGS, { noOpen: true });

      expect(result.ok).toBe(true);
      expect(waitForAppAndOpen).not.toHaveBeenCalled();
    });
  });

  it('treats a healthy daemon plus a foreground string result as success', async () => {
    vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'already-running', message: 'Daemon is already running.' });
    vi.mocked(executeGuiStart).mockResolvedValue('GUI stopped.');

    const result = await run();

    expect(result.ok).toBe(true);
  });

  it('passes noOpen through to the GUI stage', async () => {
    vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'started', message: 'Daemon started.' });
    vi.mocked(executeGuiStart).mockResolvedValue({ status: 'started', message: 'GUI started.' });

    await executeUp(...ARGS, { noOpen: true });

    expect(executeGuiStart).toHaveBeenCalledWith(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', 'node',
      expect.objectContaining({ noOpen: true, background: true }),
    );
  });

  it('defaults to opening the browser, so the launcher does not have to', async () => {
    vi.mocked(executeDaemonStart).mockResolvedValue({ status: 'started', message: 'Daemon started.' });
    vi.mocked(executeGuiStart).mockResolvedValue({ status: 'started', message: 'GUI started.' });

    await run();

    expect(executeGuiStart).toHaveBeenCalledWith(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', 'node',
      expect.objectContaining({ noOpen: undefined }),
    );
  });
});
