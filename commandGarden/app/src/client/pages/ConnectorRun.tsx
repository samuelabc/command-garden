import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type ConnectorDetail, type RunResponse } from '../api';
import { Spinner } from '../components/Spinner';

export default function ConnectorRun() {
  const { site, name } = useParams<{ site: string; name: string }>();
  const connectorKey = `${site}/${name}`;
  const [connector, setConnector] = useState<ConnectorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalId, setApprovalId] = useState<string | null>(null);

  useEffect(() => {
    if (!site || !name) return;
    api.getConnector(site, name)
      .then((d) => {
        setConnector(d.connector);
        const defaults: Record<string, string> = {};
        for (const arg of d.connector.args ?? []) {
          defaults[arg.name] = '';
        }
        setArgs(defaults);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [site, name]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setApprovalPending(false);
    setApprovalId(null);
    try {
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v) filtered[k] = v;
      }
      const resp = await api.run(connectorKey, filtered);
      if (resp.requiresApproval && resp.requestId) {
        setApprovalPending(true);
        const es = new EventSource(`/api/run/events/${resp.requestId}`);
        es.addEventListener('approval', (ev) => {
          const data = JSON.parse(ev.data);
          setApprovalId(data.approvalId);
        });
        es.addEventListener('result', (ev) => {
          const data = JSON.parse(ev.data);
          setResult(data);
          setApprovalPending(false);
          setRunning(false);
          es.close();
        });
        es.onerror = () => {
          setError('SSE connection lost');
          setRunning(false);
          es.close();
        };
      } else {
        setResult(resp);
        setRunning(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setRunning(false);
    }
  }, [args, connectorKey]);

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

  if (loading) return <Spinner label="Loading connector..." />;
  if (!connector) return <div className="text-error">Connector not found: {connectorKey}</div>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/connectors" className="text-sm opacity-50 hover:opacity-80">Connectors</Link>
        <span className="text-sm opacity-30">/</span>
      </div>
      <h2 className="text-2xl font-bold mb-2">{connectorKey}</h2>
      <p className="text-sm opacity-60 mb-6">{connector.description}</p>

      <div className="bg-base-200 rounded-lg p-5 mb-6">
        <h3 className="font-semibold mb-4">Arguments</h3>
        <div className="flex flex-wrap items-end gap-4">
          {(connector.args ?? []).map((arg) => (
            <label key={arg.name} className="form-control">
              <span className="label-text mb-1 text-sm">
                {arg.name}
                {!arg.required && <span className="opacity-40"> (optional)</span>}
              </span>
              <input
                type="text"
                className="input input-bordered input-sm w-40"
                placeholder={arg.help}
                value={args[arg.name] ?? ''}
                onChange={(e) => setArgs((prev) => ({ ...prev, [arg.name]: e.target.value }))}
                pattern={arg.pattern}
              />
              {arg.help && <span className="text-xs opacity-40 mt-1">{arg.help}</span>}
            </label>
          ))}
          <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running}>
            {running ? 'Running...' : 'Run connector'}
          </button>
        </div>
      </div>

      {running && !approvalPending && (
        <Spinner label={`Running ${connectorKey} \u2014 this drives your browser and may take up to a minute.`} />
      )}

      {approvalPending && (
        <div className="alert alert-warning mb-4">
          <span>This connector requires approval before proceeding.</span>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-success" onClick={() => handleApproval(true)} disabled={!approvalId}>
              Approve
            </button>
            <button className="btn btn-sm btn-error" onClick={() => handleApproval(false)} disabled={!approvalId}>
              Reject
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="bg-base-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Results</h3>
            <div className="text-xs opacity-40">
              {result.rowCount ?? result.data.length} rows
              {result.durationMs ? ` \u00B7 ${(result.durationMs / 1000).toFixed(1)}s` : ''}
            </div>
          </div>
          {result.data.length === 0 ? (
            <p className="text-sm opacity-50">No results returned.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    {(result.columns ?? Object.keys(result.data[0])).map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, i) => (
                    <tr key={i}>
                      {(result.columns ?? Object.keys(row)).map((col) => (
                        <td key={col} className="text-sm">{String(row[col] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
