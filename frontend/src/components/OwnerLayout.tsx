import { Outlet } from 'react-router-dom';
import OwnerNavbar from './OwnerNavbar';
import { ProductDoodleField } from './ui/AppChrome';

export default function OwnerLayout() {
  return (
    <div className="app-shell text-slate-900">
      <ProductDoodleField />
      <OwnerNavbar />
      <main className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
