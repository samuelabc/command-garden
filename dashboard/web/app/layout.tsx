import './globals.css';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';

export const metadata = { title: 'personal dashboard' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <div className="drawer lg:drawer-open">
          <input id="nav-drawer" type="checkbox" className="drawer-toggle" />
          <div className="drawer-content flex flex-col">
            <div className="navbar bg-base-100 border-b border-base-300">
              <div className="flex-none lg:hidden">
                <label htmlFor="nav-drawer" className="btn btn-square btn-ghost">≡</label>
              </div>
              <div className="flex-1 px-2 font-semibold">personal dashboard</div>
            </div>
            <main className="p-6">{children}</main>
          </div>
          <div className="drawer-side">
            <label htmlFor="nav-drawer" className="drawer-overlay" />
            <Sidebar />
          </div>
        </div>
      </body>
    </html>
  );
}
