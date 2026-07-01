import { useState, useCallback } from 'react';
import { api, type RunResponse } from '../api';

export interface ApprovalRunState {
  running: boolean;
  result: RunResponse | null;
  error: string | null;
  approvalPending: boolean;
  approvalId: string | null;
}

export interface ApprovalRunActions {
  run: (connector: string, args: Record<string, string>) => Promise<void>;
  handleApproval: (approved: boolean) => Promise<void>;
  reset: () => void;
}

export function useApprovalRun(): ApprovalRunState & ApprovalRunActions {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalId, setApprovalId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRunning(false);
    setResult(null);
    setError(null);
    setApprovalPending(false);
    setApprovalId(null);
  }, []);

  const run = useCallback(async (connector: string, args: Record<string, string>) => {
    setRunning(true);
    setError(null);
    setResult(null);
    setApprovalPending(false);
    setApprovalId(null);
    try {
      const resp = await api.run(connector, args);
      if (resp.requiresApproval && resp.requestId) {
        setApprovalPending(true);
        const es = new EventSource(`/api/run/events/${resp.requestId}`);
        es.addEventListener('approval', (ev) => {
          const data = JSON.parse(ev.data);
          setApprovalId(data.approvalId);
        });
        es.addEventListener('result', (ev) => {
          const data = JSON.parse(ev.data);
          if (!data.ok && data.error) {
            setError(data.error);
          } else {
            setResult(data);
          }
          setApprovalPending(false);
          setRunning(false);
          es.close();
        });
        es.onerror = () => {
          setError('SSE connection lost');
          setApprovalPending(false);
          setRunning(false);
          es.close();
        };
      } else if (!resp.ok && resp.error) {
        setError(resp.error);
        setRunning(false);
      } else {
        setResult(resp);
        setRunning(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setRunning(false);
    }
  }, []);

  const handleApproval = useCallback(async (approved: boolean) => {
    if (!approvalId) return;
    try {
      await api.approve(approvalId, approved);
      if (!approved) {
        setApprovalPending(false);
        setRunning(false);
        setError('Approval rejected');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    }
  }, [approvalId]);

  return { running, result, error, approvalPending, approvalId, run, handleApproval, reset };
}
