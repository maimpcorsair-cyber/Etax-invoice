import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';
import AiChatWidget from './AiChatWidget';
import { ProductDoodleField } from './ui/AppChrome';

export default function Layout() {
  return (
    <div className="app-shell">
      <ProductDoodleField />
      <Navbar />
      <main className="workspace-main">
        <Outlet />
      </main>
      <AiChatWidget />
      <MobileBottomNav />
    </div>
  );
}
