import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';
import MobileFab from './MobileFab';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6">
        <Outlet />
      </main>
      <MobileBottomNav />
      <MobileFab />
    </div>
  );
}
