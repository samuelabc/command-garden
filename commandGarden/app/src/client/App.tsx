import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api';
import Dashboard from './pages/Dashboard';
import Connectors from './pages/Connectors';
import ConnectorRun from './pages/ConnectorRun';
import Audit from './pages/Audit';
import Config from './pages/Config';
import Guide from './pages/Guide';
import Timetracking from './pages/Timetracking';
import Rooms from './pages/Rooms';

function navClass({ isActive }: { isActive: boolean }) {
  return `block px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-base-300 font-semibold' : 'hover:bg-base-300'}`;
}

function Layout() {
  const [daemonOk, setDaemonOk] = useState(false);
  const [extensionOk, setExtensionOk] = useState(false);

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

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 bg-base-200 border-r border-base-300 flex flex-col fixed top-0 left-0 bottom-0">
        <div className="p-4 border-b border-base-300">
          <h1 className="text-lg font-bold tracking-tight">commandGarden</h1>
          <p className="text-xs opacity-50 mt-0.5">Browser automation platform</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          <div className="px-2 pt-3 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Overview</div>
          <NavLink to="/" end className={navClass}>Dashboard</NavLink>

          <div className="px-2 pt-4 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Apps</div>
          <NavLink to="/apps/timetracking" className={navClass}>Time Tracking</NavLink>
          <NavLink to="/apps/rooms" className={navClass}>Room Availability</NavLink>

          <div className="px-2 pt-4 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Platform</div>
          <NavLink to="/connectors" className={navClass}>Connectors</NavLink>
          <NavLink to="/audit" className={navClass}>Audit Log</NavLink>
          <NavLink to="/config" className={navClass}>Configuration</NavLink>

          <div className="px-2 pt-4 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Help</div>
          <NavLink to="/guide" className={navClass}>Setup Guide</NavLink>
        </nav>
        <div className="p-3 border-t border-base-300">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${daemonOk ? 'bg-success' : 'bg-error'}`} />
            <span className="opacity-60">{daemonOk ? 'Daemon connected' : 'Daemon offline'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <span className={`w-2 h-2 rounded-full ${extensionOk ? 'bg-success' : 'bg-error'}`} />
            <span className="opacity-60">{extensionOk ? 'Extension linked' : 'Extension disconnected'}</span>
          </div>
        </div>
      </aside>
      <main className="ml-60 flex-1 p-6">
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
