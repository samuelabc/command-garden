// src/commands/run.ts
import { createInterface } from 'node:readline';
import type { DaemonClient } from '@commandgarden/shared';
import type { RunCommandResponse, ApprovalRequest } from '@commandgarden/shared';
import { format, type OutputFormat } from '../formatters.js';

export function parseConnectorArgs(rawArgs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
        result[arg.slice(2)] = rawArgs[i + 1];
        i++;
      } else {
        result[arg.slice(2)] = 'true';
      }
    }
    i++;
  }
  return result;
}

interface CancellablePrompt {
  promise: Promise<boolean>;
  cancel: () => void;
}

function promptApproval(request: ApprovalRequest): CancellablePrompt {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    rl.close();
  };
  const prompt = `\n⚠  Step ${request.stepIndex + 1} [${request.stepType}] in ${request.connectorKey} requires approval.\n   Capabilities: ${request.capabilities.join(', ')}\n   ${request.description}\n   Approve? (y/n): `;
  const promise = new Promise<boolean>((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      if (cancelled) return;
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
    rl.on('close', () => {
      if (cancelled) resolve(true);
    });
  });
  return { promise, cancel };
}

export async function executeRun(
  client: DaemonClient,
  connector: string,
  args: Record<string, string>,
  outputFormat: OutputFormat,
): Promise<string> {
  try {
    const resp = await client.post<RunCommandResponse>('/api/run', {
      connector, args, format: outputFormat,
    });

    // Non-approval path: synchronous response with data
    if (!resp.requiresApproval) {
      if (!resp.ok) {
        return `Error: ${resp.error ?? 'Unknown error from extension'} (${resp.durationMs}ms)`;
      }
      return format(resp.data, resp.columns, connector, outputFormat);
    }

    // Approval path: connect SSE and handle approval prompts
    const requestId = resp.requestId!;
    process.stderr.write(`Pipeline requires approval. Waiting for steps...\n`);

    return new Promise<string>((resolve) => {
      const abortController = new AbortController();
      let activePrompt: CancellablePrompt | null = null;

      client.connectSSE(
        `/api/run/events/${requestId}`,
        (event, data) => {
          if (event === 'approval') {
            const approvalReq = data as ApprovalRequest;
            activePrompt = promptApproval(approvalReq);
            activePrompt.promise.then(async (approved) => {
              activePrompt = null;
              try {
                await client.post('/api/approval', {
                  approvalId: approvalReq.approvalId,
                  approved,
                });
              } catch {
                // 404 = approval already resolved elsewhere (e.g. extension) — not an error
              }
              if (!approved) {
                abortController.abort();
                resolve(`Aborted: Step ${approvalReq.stepIndex + 1} [${approvalReq.stepType}] was rejected.`);
              }
            });
          } else if (event === 'result') {
            if (activePrompt) {
              activePrompt.cancel();
              activePrompt = null;
              process.stderr.write('\n   (approved via extension)\n');
            }
            abortController.abort();
            const result = data as RunCommandResponse;
            if (!result.ok) {
              resolve(`Error: ${result.error ?? 'Unknown error'} (${result.durationMs}ms)`);
            } else {
              resolve(format(result.data, result.columns ?? [], connector, outputFormat));
            }
          }
        },
        abortController.signal,
      ).catch(() => {
        // SSE stream ended (abort or server closed)
      });
    });
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
