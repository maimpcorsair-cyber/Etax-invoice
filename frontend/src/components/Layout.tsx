import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';
import MobileFab from './MobileFab';
import AiChatWidget from './AiChatWidget';
import { ProductDoodleField } from './ui/AppChrome';

export default function Layout() {
  return (
    <div className="app-shell">
      <ProductDoodleField />
      <Navbar />
      <main className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-8">
        <Outlet />
      </main>
      <AiChatWidget />
      <MobileBottomNav />
      <MobileFab />
    </div>
  );
}
