'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AuditPage } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuditTable } from '@/components/AuditTable';

const PAGE_SIZE = 20;

export default function AuditPageView() {
  const [page, setPage] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');
  const [command, setCommand] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setPage(await api.audit({ limit: PAGE_SIZE, offset, status: status || undefined, command: command || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [offset, status, command]);

  useEffect(() => { load(); }, [load]);

  const total = page?.total ?? 0;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="form-control">
          <span className="label-text mb-1">Status</span>
          <select className="select select-bordered" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }}>
            <option value="">All</option>
            <option value="success">success</option>
            <option value="auth_required">auth_required</option>
            <option value="empty">empty</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Command</span>
          <select className="select select-bordered" value={command} onChange={(e) => { setOffset(0); setCommand(e.target.value); }}>
            <option value="">All</option>
            <option value="timetracking report">timetracking report</option>
            <option value="teams roomfreebusy">teams roomfreebusy</option>
          </select>
        </label>
      </div>

      {loading && <Spinner label="Loading audit log…" />}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {page && <AuditTable items={page.items} total={page.total} />}

      <div className="join">
        <button className="btn join-item" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Prev</button>
        <button className="btn join-item btn-disabled">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</button>
        <button className="btn join-item" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
      </div>
    </div>
  );
}
