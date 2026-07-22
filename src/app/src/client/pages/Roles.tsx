import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { api } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';

interface UisUser {
  uid: string;
  givenName: string;
  familyName: string;
  mail: string;
  department: string;
  supervisor: string;
  usertype: string;
  employeeType: string;
  managementlevel: string;
  active: boolean;
  isClient: boolean;
  groups: string;
  scopes: string;
}

interface AliceRole {
  roleId: string;
  roleName: string;
  description: string;
  roleType: string;
  validFrom: string;
  validTo: string;
  isSelfRequestable: boolean;
  privileged: boolean;
  dataClassification: string;
}

type LoadPhase = 'idle' | 'loading' | 'done' | 'error';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function parseUisUser(raw: Record<string, unknown>): UisUser {
  return {
    uid: String(raw.uid ?? ''),
    givenName: String(raw.givenName ?? ''),
    familyName: String(raw.familyName ?? ''),
    mail: String(raw.mail ?? ''),
    department: String(raw.department ?? ''),
    supervisor: String(raw.supervisor ?? ''),
    usertype: String(raw.usertype ?? ''),
    employeeType: String(raw.employeeType ?? ''),
    managementlevel: String(raw.managementlevel ?? ''),
    active: Boolean(raw.active),
    isClient: Boolean(raw.isClient),
    groups: String(raw.groups ?? ''),
    scopes: String(raw.scopes ?? ''),
  };
}

function parseAliceRole(raw: Record<string, unknown>): AliceRole {
  return {
    roleId: String(raw.roleId ?? ''),
    roleName: String(raw.roleName ?? ''),
    description: String(raw.description ?? ''),
    roleType: String(raw.roleType ?? ''),
    validFrom: String(raw.validFrom ?? ''),
    validTo: String(raw.validTo ?? ''),
    isSelfRequestable: Boolean(raw.isSelfRequestable),
    privileged: Boolean(raw.privileged),
    dataClassification: String(raw.dataClassification ?? ''),
  };
}

export default function Roles() {
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [userId, setUserId] = useState('');
  const [userInfo, setUserInfo] = useState<UisUser | null>(null);
  const [roles, setRoles] = useState<AliceRole[]>([]);
  const [uisError, setUisError] = useState<string | null>(null);
  const [aliceError, setAliceError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showGroups, setShowGroups] = useState(false);
  const [showScopes, setShowScopes] = useState(false);
  const [approvedHighRisk, setApprovedHighRisk] = useState<string[]>([]);
  const lastFetchedUserId = useRef<string | null>(null);

  const loading = phase === 'loading';

  const loadConfig = useCallback(() => {
    api.getConfig()
      .then((res) => {
        const security = (res.config.security ?? {}) as Record<string, unknown>;
        setApprovedHighRisk((security.approvedHighRisk as string[]) ?? []);
      })
      .catch(() => {});
  }, []);

  // Hydrate from cache and config on mount
  useEffect(() => {
    loadConfig();
    let stale = false;
    api.getCachedRoles().then((res) => {
      if (stale) return;
      if (res.userId) {
        setUserId(res.userId);
        lastFetchedUserId.current = res.userId;
        setPhase((cur) => {
          if (cur === 'loading') { stale = true; return cur; }
          return 'done';
        });
        if (stale) return;
        if (res.uisData) setUserInfo(parseUisUser(res.uisData));
        if (res.aliceData) setRoles(res.aliceData.map(parseAliceRole));
        setFetchedAt(res.fetchedAt);
        setIsCached(true);
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, [loadConfig]);

  // Reset displayed data when the user ID input diverges from last fetched
  useEffect(() => {
    const trimmed = userId.trim().toUpperCase();
    if (lastFetchedUserId.current !== null && trimmed !== lastFetchedUserId.current && phase !== 'loading') {
      setPhase('idle');
      setUserInfo(null);
      setRoles([]);
      setUisError(null);
      setAliceError(null);
      setFetchedAt(null);
      setIsCached(false);
      setExpandedRows(new Set());
    }
  }, [userId, phase]);

  const handleLoad = useCallback(async () => {
    const trimmed = userId.trim().toUpperCase();
    if (!trimmed) return;

    setPhase('loading');
    setUisError(null);
    setAliceError(null);
    setUserInfo(null);
    setRoles([]);
    setIsCached(false);
    setExpandedRows(new Set());

    const [aliceResult, uisResult] = await Promise.allSettled([
      api.run('alice/role-list', { userId: trimmed }),
      api.run('uis/mic-user-information', { userId: trimmed }),
    ]);

    let newRoles: AliceRole[] = [];
    let newUser: UisUser | null = null;
    let anySuccess = false;

    // Process Alice result
    if (aliceResult.status === 'fulfilled') {
      const resp = aliceResult.value;
      if (resp.ok && resp.data) {
        newRoles = resp.data.map(parseAliceRole);
        anySuccess = true;
      } else if (resp.error) {
        setAliceError(resp.error);
      }
    } else {
      setAliceError(aliceResult.reason instanceof Error ? aliceResult.reason.message : 'Failed to fetch roles');
    }

    // Process UIS result
    if (uisResult.status === 'fulfilled') {
      const resp = uisResult.value;
      if (resp.ok && resp.data && resp.data.length > 0) {
        newUser = parseUisUser(resp.data[0]);
        anySuccess = true;
      } else if (resp.error) {
        setUisError(resp.error);
      }
    } else {
      setUisError(uisResult.reason instanceof Error ? uisResult.reason.message : 'Failed to fetch user info');
    }

    setRoles(newRoles);
    setUserInfo(newUser);

    if (anySuccess) {
      setPhase('done');
      lastFetchedUserId.current = trimmed;
      const now = new Date().toISOString();
      setFetchedAt(now);
      api.cacheRoles({
        userId: trimmed,
        uisData: newUser as unknown as Record<string, unknown> | null,
        aliceData: newRoles as unknown as Record<string, unknown>[],
      }).catch(() => {});
    } else {
      setPhase('error');
    }
  }, [userId]);

  const toggleRow = useCallback((roleId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  const filteredRoles = useMemo(() => {
    let filtered = roles;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) => r.roleName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }
    return [...filtered].sort((a, b) => a.roleName.localeCompare(b.roleName));
  }, [roles, searchQuery]);

  const stats = useMemo(() => {
    return { total: roles.length };
  }, [roles]);

  const isAuthError = (err: string | null) =>
    err?.includes('auth_required') || err?.includes('sign in');

  const isApprovalError = (err: string | null) =>
    err?.includes('not approved') || err?.includes('approvedHighRisk');

  const handleApproveUis = useCallback(async () => {
    try {
      const updated = [...approvedHighRisk, 'uis/mic-user-information'];
      await api.setConfig('security.approvedHighRisk', JSON.stringify(updated));
      setApprovedHighRisk(updated);
      setUisError(null);
      const resp = await api.run('uis/mic-user-information', { userId: userId.trim().toUpperCase() });
      if (resp.ok && resp.data && resp.data.length > 0) {
        const newUser = parseUisUser(resp.data[0]);
        setUserInfo(newUser);
        api.cacheRoles({
          userId: userId.trim().toUpperCase(),
          uisData: newUser as unknown as Record<string, unknown>,
          aliceData: roles as unknown as Record<string, unknown>[],
        }).catch(() => {});
      } else if (resp.error) {
        setUisError(resp.error);
      }
    } catch (e) {
      setUisError(e instanceof Error ? e.message : 'Approval failed');
    }
  }, [userId, roles, approvedHighRisk]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLoad();
  }, [handleLoad]);

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Roles</h2>

      {/* Cache indicator */}
      {fetchedAt && !loading && (
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-3">
          {isCached ? 'Showing cached data from' : 'Last fetched'} {timeAgo(fetchedAt)}
        </div>
      )}

      {/* User ID input + fetch button */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
        <label className="form-control w-full sm:w-auto sm:flex-1 sm:max-w-xs">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">User ID</span>
          <input
            type="text"
            className="input input-bordered input-sm w-full font-mono uppercase"
            placeholder="e.g. SATHIEN"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
        </label>
        <button
          className="btn btn-primary btn-sm w-full sm:w-auto"
          onClick={handleLoad}
          disabled={loading || !userId.trim()}
        >
          {loading ? 'Fetching...' : 'Fetch roles'}
        </button>
      </div>

      {loading && <Spinner label="Fetching roles and user info..." />}

      {/* Full error state — both sources failed */}
      {phase === 'error' && (
        <div className="space-y-3">
          {aliceError && (
            isAuthError(aliceError)
              ? <AuthRequiredCallout message="Sign in to Alice in Chrome, then try again." />
              : <div className="alert alert-error"><span>Alice: {aliceError}</span></div>
          )}
          {uisError && (
            isAuthError(uisError)
              ? <AuthRequiredCallout message="Sign in to UIS in Chrome, then try again." />
              : isApprovalError(uisError)
                ? (
                  <div className="alert alert-warning">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                      <span className="flex-1">UIS connector requires approval before first use.</span>
                      <button className="btn btn-sm btn-warning" onClick={handleApproveUis}>Approve &amp; retry</button>
                    </div>
                  </div>
                )
                : <div className="alert alert-error"><span>UIS: {uisError}</span></div>
          )}
        </div>
      )}

      {/* Identity header */}
      {phase === 'done' && !loading && (
        <>
          {userInfo ? (
            <div className="border border-base-300 p-4 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="font-display text-lg font-bold">
                  {userInfo.givenName} {userInfo.familyName}
                </h3>
                <Badge variant={userInfo.active ? 'success' : 'error'} size="xs">
                  {userInfo.active ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="font-mono text-[0.65rem] uppercase opacity-40 min-w-[5.5rem] shrink-0 pt-0.5">Department</span>
                  <span>{userInfo.department || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-mono text-[0.65rem] uppercase opacity-40 min-w-[5.5rem] shrink-0 pt-0.5">Email</span>
                  <span className="break-all">{userInfo.mail || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-mono text-[0.65rem] uppercase opacity-40 min-w-[5.5rem] shrink-0 pt-0.5">Supervisor</span>
                  <span>{userInfo.supervisor || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-mono text-[0.65rem] uppercase opacity-40 min-w-[5.5rem] shrink-0 pt-0.5">Type</span>
                  <span>{userInfo.employeeType || '—'}</span>
                </div>
              </div>

              {/* Collapsible groups */}
              {userInfo.groups && (
                <div className="mt-3 border-t border-base-300/50 pt-2">
                  <button
                    className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase opacity-50 hover:opacity-80 transition-opacity"
                    onClick={() => setShowGroups((p) => !p)}
                  >
                    <svg className={`w-3 h-3 transition-transform duration-150 ${showGroups ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Groups ({userInfo.groups.split(',').filter(Boolean).length})
                  </button>
                  {showGroups && (
                    <div className="mt-1.5 font-mono text-xs opacity-60 leading-relaxed pl-4">
                      {userInfo.groups}
                    </div>
                  )}
                </div>
              )}

              {/* Collapsible scopes */}
              {userInfo.scopes && (
                <div className="mt-2 border-t border-base-300/50 pt-2">
                  <button
                    className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase opacity-50 hover:opacity-80 transition-opacity"
                    onClick={() => setShowScopes((p) => !p)}
                  >
                    <svg className={`w-3 h-3 transition-transform duration-150 ${showScopes ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Scopes ({userInfo.scopes.split(',').filter(Boolean).length})
                  </button>
                  {showScopes && (
                    <div className="mt-1.5 font-mono text-xs opacity-60 leading-relaxed pl-4">
                      {userInfo.scopes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : uisError ? (
            // UIS failed but Alice succeeded — show inline error
            isApprovalError(uisError) ? (
              <div className="alert alert-warning mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                  <span className="flex-1">UIS connector requires approval to show user identity.</span>
                  <button className="btn btn-sm btn-warning" onClick={handleApproveUis}>Approve &amp; fetch</button>
                </div>
              </div>
            ) : isAuthError(uisError) ? (
              <AuthRequiredCallout message="Sign in to UIS in Chrome to see user identity details." />
            ) : (
              <div className="alert alert-error mb-6">
                <span>User identity unavailable: {uisError}</span>
              </div>
            )
          ) : null}

          {/* Alice error when UIS succeeded */}
          {aliceError && roles.length === 0 && (
            isAuthError(aliceError)
              ? <AuthRequiredCallout message="Sign in to Alice in Chrome to see role assignments." />
              : <div className="alert alert-error mb-6"><span>Roles unavailable: {aliceError}</span></div>
          )}

          {/* Filter bar */}
          {roles.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <input
                type="text"
                className="input input-bordered input-sm flex-1 sm:max-w-xs"
                placeholder="Search roles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="font-mono text-xs opacity-40 sm:ml-auto">
                {filteredRoles.length} of {stats.total} role{stats.total !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Role table */}
          {filteredRoles.length > 0 && (
            <div className="border border-base-300 overflow-x-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="border-b border-base-300">
                    <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] w-6"></th>
                    <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Role Name</th>
                    <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Type</th>
                    <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Valid From</th>
                    <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Valid To</th>
                    <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Priv</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoles.map((role) => {
                    const expanded = expandedRows.has(role.roleId);
                    return (
                      <tr
                        key={role.roleId}
                        className="border-b border-base-300/50 cursor-pointer hover:bg-base-200/50 transition-colors duration-150"
                        onClick={() => toggleRow(role.roleId)}
                      >
                        <td className="align-top">
                          <svg className={`w-3 h-3 opacity-30 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                        <td className="align-top">
                          <div className="text-sm font-semibold">{role.roleName}</div>
                          {expanded && (
                            <div className="mt-2 space-y-1.5 pb-1">
                              {role.description && (
                                <div className="text-xs opacity-60 max-w-lg">{role.description}</div>
                              )}
                              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.6rem] opacity-40">
                                <span>ID: {role.roleId}</span>
                                <span>Classification: {role.dataClassification || '—'}</span>
                                <span>Self-requestable: {role.isSelfRequestable ? 'Yes' : 'No'}</span>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="align-top">
                          <Badge variant="neutral" size="xs">{role.roleType || '—'}</Badge>
                        </td>
                        <td className="align-top font-mono text-sm">{formatDate(role.validFrom)}</td>
                        <td className="align-top font-mono text-sm">{formatDate(role.validTo)}</td>
                        <td className="align-top">
                          {role.privileged
                            ? <Badge variant="warning" size="xs">YES</Badge>
                            : <span className="font-mono text-[0.65rem] opacity-30">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty filtered results */}
          {roles.length > 0 && filteredRoles.length === 0 && (
            <div className="border border-base-300 p-6 text-center">
              <p className="text-sm opacity-50 mb-1">No matching roles</p>
              <p className="font-mono text-xs opacity-30">Try adjusting your search query.</p>
            </div>
          )}

          {/* No roles from Alice at all */}
          {phase === 'done' && roles.length === 0 && !aliceError && (
            <div className="border border-base-300 p-6 text-center">
              <p className="text-sm opacity-50 mb-1">No role assignments found</p>
              <p className="font-mono text-xs opacity-30">This user has no roles assigned in Alice.</p>
            </div>
          )}
        </>
      )}

      {/* Idle state */}
      {phase === 'idle' && (
        <div className="border border-base-300 p-8 text-center">
          <p className="text-sm opacity-50 mb-1">User role lookup</p>
          <p className="font-mono text-xs opacity-30">Enter a user ID and press "Fetch roles" to view role assignments from Alice and user identity from UIS.</p>
        </div>
      )}
    </div>
  );
}
