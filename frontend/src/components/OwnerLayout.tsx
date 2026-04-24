import { Outlet } from 'react-router-dom';
import OwnerNavbar from './OwnerNavbar';

export default function OwnerLayout() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] text-slate-900">
      <OwnerNavbar />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
