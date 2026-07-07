import { BrowserRouter, Routes, Route, NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { useActiveSection } from './hooks/useActiveSection';
import { api, groupBySite } from './api';
import Dashboard from './pages/Dashboard';
import Connectors from './pages/Connectors';
import ConnectorRun from './pages/ConnectorRun';
import Audit from './pages/Audit';
import Config from './pages/Config';
import Guide from './pages/Guide';
import Timetracking from './pages/Timetracking';
import Rooms from './pages/Rooms';
import Journal from './pages/Journal';
import SecurityNews from './pages/SecurityNews';
import TrustedPeerExpiry from './pages/TrustedPeerExpiry';
import Architecture from './pages/Architecture';
import ApiReference from './pages/ApiReference';
import Skills from './pages/Skills';

function navClass({ isActive }: { isActive: boolean }) {
  return `block px-3 py-2 text-sm transition-colors ${isActive ? 'bg-primary text-primary-content font-semibold' : 'hover:text-primary'}`;
}

interface SectionDef { label: string; id: string }

const PAGE_SECTIONS: Record<string, SectionDef[]> = {
  '/config': [
    { label: 'Server', id: 'cfg-server' },
    { label: 'Security', id: 'cfg-security' },
    { label: 'Sources', id: 'cfg-sources' },
    { label: 'Audit', id: 'cfg-audit' },
    { label: 'Output', id: 'cfg-output' },
    { label: 'Journal', id: 'cfg-journal' },
  ],
  '/architecture': [
    { label: 'Diagram', id: 'arch-diagram' },
    { label: 'Components', id: 'arch-components' },
    { label: 'Data Stores', id: 'arch-stores' },
    { label: 'Data Flows', id: 'arch-flows' },
    { label: 'Security', id: 'arch-security' },
    { label: 'Packages', id: 'arch-packages' },
    { label: 'Build Order', id: 'arch-build' },
  ],
  '/api-reference': [
    { label: 'Endpoints', id: 'api-endpoints' },
    { label: 'Pipeline Steps', id: 'api-pipeline' },
    { label: 'Expressions', id: 'api-expressions' },
  ],
};

function SectionSubNav({ sections }: { sections: SectionDef[] }) {
  const ids = useMemo(() => sections.map(s => s.id), [sections]);
  const activeId = useActiveSection(ids);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ml-3 border-l border-base-300 py-0.5">
      {sections.map(s => (
        <button
          key={s.id}
          onClick={() => handleClick(s.id)}
          className={`block w-full text-left pl-3 py-1 text-[0.7rem] font-mono transition-colors ${
            activeId === s.id
              ? 'text-primary opacity-100'
              : 'opacity-40 hover:opacity-70'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function NavItemWithSections({ to, label, sections }: { to: string; label: string; sections: SectionDef[] }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <>
      <NavLink to={to} end={to === '/'} className={navClass}>{label}</NavLink>
      {isActive && sections.length > 0 && <SectionSubNav sections={sections} />}
    </>
  );
}

function Layout() {
  const [daemonOk, setDaemonOk] = useState(false);
  const [extensionOk, setExtensionOk] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connectorSites, setConnectorSites] = useState<string[]>([]);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const poll = () => {
      api.getStatus()
        .then((s) => { setDaemonOk(s.ok); setExtensionOk(s.extensionConnected); })
        .catch(() => { setDaemonOk(false); setExtensionOk(false); });
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.getConnectors()
      .then((res) => {
        const sites = groupBySite(res.connectors).map(([site]) => site);
        setConnectorSites(sites);
      })
      .catch(() => {});
  }, []);

  const connectorSections = useMemo<SectionDef[]>(
    () => connectorSites.map(site => ({ label: site, id: `conn-${site}` })),
    [connectorSites],
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden btn btn-sm btn-ghost"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {sidebarOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`w-56 bg-base-100 border-r border-base-300 flex flex-col fixed top-0 left-0 bottom-0 z-40 transition-transform duration-150 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-base-300">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <h1 className="font-display text-base font-bold tracking-tight"><span className="font-normal opacity-60">command</span>Garden</h1>
            <p className="font-mono text-[0.6rem] opacity-40 mt-0.5 uppercase tracking-widest">browser automation</p>
          </Link>
          <button
            className="btn btn-ghost btn-sm btn-square"
            onClick={() => {
              const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
              document.documentElement.setAttribute('data-theme', next);
              localStorage.setItem('theme', next);
            }}
            aria-label="Toggle theme"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 px-2 py-2 space-y-px overflow-y-auto">
          <div className="px-3 pt-3 pb-1.5 font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.12em]">Overview</div>
          <NavLink to="/" end className={navClass}>Dashboard</NavLink>

          <div className="px-3 pt-4 pb-1.5 font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.12em]">Apps</div>
          <NavLink to="/apps/timetracking" className={navClass}>Time Tracking</NavLink>
          <NavLink to="/apps/rooms" className={navClass}>Room Availability</NavLink>
          <NavLink to="/apps/journal" className={navClass}>Dev Journal</NavLink>
          <NavLink to="/apps/security-news" className={navClass}>Security News</NavLink>
          <NavLink to="/apps/trusted-peer-expiry" className={navClass}>Trusted Peer Expiry</NavLink>

          <div className="px-3 pt-4 pb-1.5 font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.12em]">Platform</div>
          <NavItemWithSections to="/connectors" label="Connectors" sections={connectorSections} />
          <NavLink to="/audit" className={navClass}>Audit Log</NavLink>
          <NavItemWithSections to="/config" label="Configuration" sections={PAGE_SECTIONS['/config']} />

          <div className="px-3 pt-4 pb-1.5 font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.12em]">Help</div>
          <NavLink to="/guide" className={navClass}>Setup Guide</NavLink>
          <NavLink to="/skills" className={navClass}>Skills</NavLink>
          <NavItemWithSections to="/architecture" label="Architecture" sections={PAGE_SECTIONS['/architecture']} />
          <NavItemWithSections to="/api-reference" label="API & CLI" sections={PAGE_SECTIONS['/api-reference']} />
        </nav>
        <div className="px-3 py-2.5 border-t border-base-300">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className={`w-1.5 h-1.5 ${daemonOk ? 'bg-success' : 'bg-error'}`} aria-hidden="true" />
            <span className="opacity-50 text-[0.65rem]">{daemonOk ? 'DAEMON OK' : 'DAEMON OFF'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono mt-1">
            <span className={`w-1.5 h-1.5 ${extensionOk ? 'bg-success' : 'bg-error'}`} aria-hidden="true" />
            <span className="opacity-50 text-[0.65rem]">{extensionOk ? 'EXTENSION LINKED' : 'EXTENSION OFF'}</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 p-4 pt-14 md:pt-5 md:p-5 md:ml-56">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="connectors" element={<Connectors />} />
          <Route path="connectors/:site/:name" element={<ConnectorRun />} />
          <Route path="audit" element={<Audit />} />
          <Route path="config" element={<Config />} />
          <Route path="guide" element={<Guide />} />
          <Route path="apps/timetracking" element={<Timetracking />} />
          <Route path="apps/rooms" element={<Rooms />} />
          <Route path="apps/journal" element={<Journal />} />
          <Route path="apps/security-news" element={<SecurityNews />} />
          <Route path="apps/trusted-peer-expiry" element={<TrustedPeerExpiry />} />
          <Route path="architecture" element={<Architecture />} />
          <Route path="api-reference" element={<ApiReference />} />
          <Route path="skills" element={<Skills />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
