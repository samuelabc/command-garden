import { OpencliService } from './opencli.service';
import { EventEmitter } from 'events';
import * as child_process from 'child_process';

jest.mock('child_process');

function fakeChild() {
  const cp: any = new EventEmitter();
  cp.stdout = new EventEmitter();
  cp.stderr = new EventEmitter();
  cp.kill = jest.fn();
  return cp;
}

describe('OpencliService', () => {
  let service: OpencliService;
  let cp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OpencliService();
    cp = fakeChild();
    (child_process.spawn as jest.Mock).mockReturnValue(cp);
  });

  it('TC-OS-1: parses a JSON array on success', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stdout.emit('data', JSON.stringify([{ a: 1 }, { a: 2 }]));
    cp.emit('close', 0);
    const res = await p;
    expect(res.status).toBe('success');
    expect(res.rowCount).toBe(2);
    expect(res.data).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('TC-OS-2: maps AUTH_REQUIRED on stderr to auth_required', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stderr.emit('data', 'Error: AUTH_REQUIRED please log in');
    cp.emit('close', 1);
    const res = await p;
    expect(res.status).toBe('auth_required');
    expect(res.errorCode).toBe('AUTH_REQUIRED');
  });

  it('TC-OS-3: maps EMPTY_RESULT to empty', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stderr.emit('data', 'EMPTY_RESULT: no rows');
    cp.emit('close', 1);
    const res = await p;
    expect(res.status).toBe('empty');
    expect(res.rowCount).toBe(0);
  });

  it('TC-OS-4: kills child and returns error on timeout', async () => {
    jest.useFakeTimers();
    const p = service.run(['teams', 'roomfreebusy'], { timeoutMs: 50 });
    jest.advanceTimersByTime(60);
    const res = await p;
    expect(cp.kill).toHaveBeenCalled();
    expect(res.status).toBe('error');
    expect(res.errorMessage).toMatch(/timed out/i);
    jest.useRealTimers();
  });

  it('TC-OS-5: error on malformed stdout', async () => {
    const p = service.run(['timetracking', 'report']);
    cp.stdout.emit('data', 'not-json<<<');
    cp.emit('close', 0);
    const res = await p;
    expect(res.status).toBe('error');
    expect(res.errorMessage).toMatch(/parse|json/i);
  });

  it('TC-OS-6: passes args as an array (no shell)', async () => {
    const p = service.run(['teams', 'roomfreebusy', '--room', 'MBTMY The Vista']);
    cp.stdout.emit('data', '[]');
    cp.emit('close', 0);
    await p;
    const call = (child_process.spawn as jest.Mock).mock.calls[0];
    expect(call[1]).toEqual(
      expect.arrayContaining(['teams', 'roomfreebusy', '--room', 'MBTMY The Vista', '--format', 'json']),
    );
    // shell must NOT be enabled
    expect(call[2]?.shell).not.toBe(true);
  });
});
