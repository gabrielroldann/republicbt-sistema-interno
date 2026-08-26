import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

export function Shell() {
  const [recolhida, setRecolhida] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar recolhida={recolhida} alternar={() => setRecolhida((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="flex-1 px-6 py-5">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
