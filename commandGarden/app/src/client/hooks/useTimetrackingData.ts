import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { api, type Goal, type ProjectActivity, type RunResponse } from '../api';

interface ProjectGroup {
  projectId: string;
  totalHours: number;
  entryCount: number;
  activities: Set<string>;
}

export function useTimetrackingData(month: string, result: RunResponse | null) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [cachedRows, setCachedRows] = useState<Record<string, unknown>[]>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [allProjects, setAllProjects] = useState<ProjectActivity[]>([]);
  const allProjectsRef = useRef(allProjects);
  allProjectsRef.current = allProjects;
  const [refreshingProjects, setRefreshingProjects] = useState(false);

  const loadGoals = useCallback(async () => {
    try {
      const res = await api.getGoals(month);
      setGoals(res.goals);
    } catch { /* silent */ }
  }, [month]);

  const loadCache = useCallback(async () => {
    try {
      const res = await api.getCachedReport(month);
      if (res.data) {
        setCachedRows(res.data);
        setCachedAt(res.fetchedAt);
      } else {
        setCachedRows([]);
        setCachedAt(null);
      }
    } catch { /* silent */ }
  }, [month]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await api.getCachedProjects();
      if (res.data) setAllProjects(res.data);
    } catch { /* silent */ }
  }, []);

  const refreshProjects = useCallback(async () => {
    setRefreshingProjects(true);
    try {
      const resp = await api.run('timetracking/projects', { month });
      if (resp.ok && resp.data && resp.data.length > 0) {
        const projects = resp.data.map((r) => ({
          projectId: String(r.projectId ?? ''),
          projectName: String(r.projectName ?? ''),
          activityNumber: String(r.activityNumber ?? ''),
          activityName: String(r.activityName ?? ''),
          category: String(r.category ?? ''),
          linePropertyId: String(r.linePropertyId ?? ''),
        })) as ProjectActivity[];
        setAllProjects(projects);
        await api.cacheProjects(projects);
      }
    } catch { /* silent */ }
    setRefreshingProjects(false);
  }, [month]);

  useEffect(() => {
    loadGoals();
    loadCache();
    loadProjects();
  }, [loadGoals, loadCache, loadProjects]);

  // After a successful fresh fetch, save to cache and extract projects
  const freshData = result?.data;
  useEffect(() => {
    if (freshData && freshData.length > 0) {
      setCachedAt(null);
      api.cacheReport(month, freshData as Record<string, unknown>[]).catch(() => {});
      const seen = new Set<string>();
      const extracted: ProjectActivity[] = [];
      for (const row of freshData) {
        const pid = String(row.projectId ?? '');
        const act = String(row.activity ?? '');
        if (!pid || !act) continue;
        const key = `${pid}\0${act}`;
        if (seen.has(key)) continue;
        seen.add(key);
        extracted.push({
          projectId: pid,
          projectName: row.projectName ? String(row.projectName) : pid,
          activityNumber: act,
          activityName: row.activityName ? String(row.activityName) : act,
          category: String(row.category ?? ''),
          linePropertyId: '',
        });
      }
      if (extracted.length > 0) {
        const mergedMap = new Map<string, ProjectActivity>();
        for (const p of allProjectsRef.current) mergedMap.set(`${p.projectId}\0${p.activityNumber}`, p);
        for (const p of extracted) mergedMap.set(`${p.projectId}\0${p.activityNumber}`, p);
        const merged = Array.from(mergedMap.values());
        setAllProjects(merged);
        api.cacheProjects(merged).catch(() => {});
      }
    }
  }, [freshData, month]);

  // Use fresh data if available, otherwise fall back to cached
  const rows = (result?.data ?? []).length > 0 ? (result?.data ?? []) : cachedRows;
  const isCached = rows === cachedRows && cachedRows.length > 0 && !result?.data?.length;

  // Build name maps from cached projects + report data
  const { projectNames, activityNames } = useMemo(() => {
    const pn = new Map<string, string>();
    const an = new Map<string, string>();
    for (const p of allProjects) {
      if (p.projectId && p.projectName) pn.set(p.projectId, p.projectName);
      if (p.projectId && p.activityNumber && p.activityName) {
        an.set(`${p.projectId}\0${p.activityNumber}`, p.activityName);
      }
    }
    for (const row of rows) {
      const pid = String(row.projectId ?? '');
      const pname = row.projectName ? String(row.projectName) : null;
      if (pid && pname) pn.set(pid, pname);
      const act = String(row.activity ?? '');
      const actName = row.activityName ? String(row.activityName) : null;
      if (pid && act && actName) an.set(`${pid}\0${act}`, actName);
    }
    return { projectNames: pn, activityNames: an };
  }, [allProjects, rows]);

  // Group by project
  const { projectList, totalHours, draftCount, workingDayCount } = useMemo(() => {
    const groups = new Map<string, ProjectGroup>();
    let total = 0;
    let drafts = 0;
    const days = new Set<string>();
    for (const row of rows) {
      const pid = String(row.projectId ?? 'Unknown');
      const hours = Number(row.hours ?? 0);
      const date = String(row.date ?? '');
      const status = String(row.status ?? '');
      const act = String(row.activity ?? '');
      total += hours;
      if (date) days.add(date);
      if (status === 'draft') drafts++;
      if (!groups.has(pid)) {
        groups.set(pid, { projectId: pid, totalHours: 0, entryCount: 0, activities: new Set() });
      }
      const g = groups.get(pid)!;
      g.totalHours += hours;
      g.entryCount++;
      if (act) {
        const name = activityNames.get(`${pid}\0${act}`) ?? act;
        g.activities.add(name);
      }
    }
    return {
      projectList: Array.from(groups.values()).sort((a, b) => b.totalHours - a.totalHours),
      totalHours: total,
      draftCount: drafts,
      workingDayCount: days.size,
    };
  }, [rows, activityNames]);

  // Aggregate hours by (projectId, activity) for goal matching
  const activityHours = useMemo(() => {
    const map = new Map<string, { projectId: string; activity: string; totalHours: number }>();
    for (const row of rows) {
      const pid = String(row.projectId ?? 'Unknown');
      const act = String(row.activity ?? '');
      const hrs = Number(row.hours ?? 0);
      const key = `${pid}\0${act}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalHours += hrs;
      } else {
        map.set(key, { projectId: pid, activity: act, totalHours: hrs });
      }
    }
    return Array.from(map.values());
  }, [rows]);

  // Build allCombos from cached projects (all available), falling back to report data
  const allCombos = useMemo(() => {
    return allProjects.length > 0
      ? allProjects.map((p) => ({ projectId: p.projectId, activity: p.activityNumber }))
      : activityHours.map((a) => ({ projectId: a.projectId, activity: a.activity }));
  }, [allProjects, activityHours]);

  const todayStr = new Date().toISOString().slice(0, 10);

  return {
    goals,
    loadGoals,
    rows,
    isCached,
    cachedAt,
    projectNames,
    activityNames,
    projectList,
    totalHours,
    draftCount,
    workingDayCount,
    activityHours,
    allCombos,
    todayStr,
    refreshProjects,
    refreshingProjects,
  };
}
