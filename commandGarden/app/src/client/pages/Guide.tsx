import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, type Connector } from '../api';
import { Badge } from '../components/Badge';

const CHECK_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

interface StepDef {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  instructions: string;
}

export default function Guide() {
  const [daemonOk, setDaemonOk] = useState(false);
  const [extensionOk, setExtensionOk] = useState(false);
  const [connectorCount, setConnectorCount] = useState(0);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [approvedHighRisk, setApprovedHighRisk] = useState<string[]>([]);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const s = await api.getStatus();
      setDaemonOk(s.ok);
      setExtensionOk(s.extensionConnected);
      setConnectorCount(s.connectorCount);
    } catch {
      setDaemonOk(false);
      setExtensionOk(false);
      setConnectorCount(0);
    }

    try {
      const connData = await api.getConnectors();
      setConnectors(connData.connectors);
      const configRes = await api.getConfig().catch(() => ({ ok: false, config: {} }) as { ok: boolean; config: Record<string, Record<string, unknown>> });
      const security = (configRes.config.security ?? {}) as Record<string, unknown>;
      setApprovedHighRisk((security.approvedHighRisk as string[]) ?? []);
    } catch { /* daemon not running */ }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [poll]);

  const handleApprove = useCallback(async (connectorKey: string) => {
    setApprovingKey(connectorKey);
    try {
      const updated = [...approvedHighRisk, connectorKey];
      await api.setConfig('security.approvedHighRisk', JSON.stringify(updated));
      poll();
    } catch {
      // error is visible via connector state not updating
    } finally {
      setApprovingKey(null);
    }
  }, [approvedHighRisk, poll]);

  // Build steps
  const unapproved = connectors.filter((c) => c.isHighRisk && !c.isApproved);
  const showPermissionsStep = unapproved.length > 0;

  const steps: StepDef[] = [
    {
      id: 'daemon',
      label: 'Background service',
      ok: daemonOk,
      detail: daemonOk ? 'Running' : 'Not running',
      instructions: 'Run cg up in your terminal to start commandGarden. This launches the background service and opens the web interface.',
    },
    {
      id: 'extension',
      label: 'Browser extension',
      ok: extensionOk,
      detail: extensionOk ? 'Connected' : 'Not connected',
      instructions: 'Install the commandGarden Chrome extension, then open Chrome. The extension connects automatically when the background service is running.',
    },
    {
      id: 'connectors',
      label: 'Connectors installed',
      ok: connectorCount > 0,
      detail: connectorCount > 0 ? `${connectorCount} available` : 'None found',
      instructions: 'Connectors are loaded automatically when you start the service. If none appear, check that connector files exist in ~/.commandgarden/connectors/ and restart with cg up.',
    },
  ];

  if (showPermissionsStep) {
    steps.push({
      id: 'permissions',
      label: 'Connector permissions',
      ok: false,
      detail: `${unapproved.length} need${unapproved.length === 1 ? 's' : ''} authorization`,
      instructions: 'Some connectors need authorization before first use. You can authorize them here or in Configuration \u2192 Connector Security.',
    });
  }

  const doneCount = steps.filter((s) => s.ok).length;
  const totalCount = steps.length;
  const allDone = doneCount === totalCount;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-1">Setup Guide</h2>
      <p className="text-sm opacity-60 mb-6">Complete these steps to start running connectors from your browser.</p>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-1.5 bg-base-300 overflow-hidden">
          <div
            className="h-full bg-success transition-all duration-300 ease-out"
            style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
          />
        </div>
        <span className="font-mono text-xs opacity-50 shrink-0">
          {doneCount}/{totalCount}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-3 mb-8">
        {steps.map((step, i) => (
          <div key={i} className={`border ${step.ok ? 'border-base-300' : 'border-base-300 bg-base-200/50'}`}>
            {/* Header row */}
            <div className="p-4 flex items-center gap-3">
              <span className={`w-5 h-5 flex items-center justify-center font-mono text-xs font-bold shrink-0 ${step.ok ? 'bg-success text-success-content' : 'border border-base-300 text-base-content/50'}`}>
                {step.ok ? CHECK_ICON : (i + 1)}
              </span>
              <span className="font-semibold flex-1">{step.label}</span>
              <Badge variant={step.ok ? 'success' : 'warning'}>{step.detail}</Badge>
            </div>

            {/* Instructions — always visible when failing */}
            {!step.ok && (
              <div className="px-4 pb-4 text-sm opacity-70 border-t border-base-300/50 pt-3 ml-8">
                {step.instructions}
                {step.id === 'permissions' && unapproved.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {unapproved.map((c) => (
                        <div key={c.key} className="flex items-center justify-between gap-3 py-1.5">
                          <div>
                            <span className="font-mono text-sm">{c.key}</span>
                            {c.description && <span className="text-xs opacity-50 ml-2">{c.description}</span>}
                          </div>
                          <button
                            className="btn btn-sm btn-warning btn-outline shrink-0"
                            disabled={approvingKey === c.key}
                            onClick={() => handleApprove(c.key)}
                          >
                            {approvingKey === c.key ? 'Authorizing\u2026' : 'Authorize'}
                          </button>
                        </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Completion / Try it out */}
      {allDone && connectors.length > 0 && (
        <div className="border border-success/30 bg-success/5 p-5">
          <p className="font-semibold text-success mb-3">Everything's ready. Pick a connector to try.</p>
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => {
              const [site, name] = c.key.split('/');
              return (
                <Link key={c.key} to={`/connectors/${site}/${name}`} className="btn btn-sm btn-outline">
                  <span className="font-mono">{name}</span>
                  <span className="opacity-50 font-normal ml-1">{site}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!allDone && connectors.length > 0 && (
        <>
          <h3 className="font-display text-base font-semibold mb-3">Available connectors</h3>
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => {
              const [site, name] = c.key.split('/');
              return (
                <Link key={c.key} to={`/connectors/${site}/${name}`} className="btn btn-sm btn-ghost">
                  <span className="font-mono">{name}</span>
                  <span className="opacity-40 font-normal ml-1">{site}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
