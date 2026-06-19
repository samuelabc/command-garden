import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { OpencliResult, OpencliRunOptions } from './opencli.types';

const OPENCLI_BIN = process.platform === 'win32' ? 'opencli.cmd' : 'opencli';
const DEFAULT_TIMEOUT = 120_000;

@Injectable()
export class OpencliService {
  run<T = Record<string, unknown>>(args: string[], opts: OpencliRunOptions = {}): Promise<OpencliResult<T>> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    const argv = [...args, '--format', 'json'];
    const start = Date.now();
    const isWin = process.platform === 'win32';

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      // On Windows, shell:true forces windowsVerbatimArguments=true so
      // arguments containing spaces are NOT quoted automatically.
      // Wrap them ourselves so cmd.exe keeps them as single tokens.
      const safeArgv = isWin
        ? argv.map((a) => (a.includes(' ') ? `"${a}"` : a))
        : argv;
      const child = spawn(OPENCLI_BIN, safeArgv, { shell: isWin });

      const finish = (r: Omit<OpencliResult<T>, 'durationMs'>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ...r, durationMs: Date.now() - start });
      };

      const timer = setTimeout(() => {
        child.kill();
        finish({ status: 'error', data: [], rowCount: 0, exitCode: null, errorMessage: 'opencli command timed out' });
      }, timeoutMs);

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (e) =>
        finish({ status: 'error', data: [], rowCount: 0, exitCode: null, errorMessage: `spawn failed: ${e.message}` }),
      );

      child.on('close', (code) => {
        const errBlob = stderr.toUpperCase();
        if (/AUTH_REQUIRED/.test(errBlob)) {
          return finish({ status: 'auth_required', data: [], rowCount: 0, exitCode: code, errorCode: 'AUTH_REQUIRED', errorMessage: stderr.trim().slice(0, 500) });
        }
        if (/EMPTY_RESULT/.test(errBlob)) {
          return finish({ status: 'empty', data: [], rowCount: 0, exitCode: code, errorCode: 'EMPTY_RESULT', errorMessage: stderr.trim().slice(0, 500) });
        }
        if (code !== 0 && !stdout.trim()) {
          const m = stderr.match(/\b([A-Z_]{4,})\b/);
          return finish({ status: 'error', data: [], rowCount: 0, exitCode: code, errorCode: m?.[1], errorMessage: stderr.trim().slice(0, 500) || `exit ${code}` });
        }
        try {
          const parsed = JSON.parse(stdout);
          const rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? parsed.data ?? []);
          finish({ status: 'success', data: rows as T[], rowCount: rows.length, exitCode: code });
        } catch (_e) {
          finish({ status: 'error', data: [], rowCount: 0, exitCode: code, errorMessage: `failed to parse opencli JSON output; stderr: ${stderr.trim().slice(0, 300)}` });
        }
      });
    });
  }
}
