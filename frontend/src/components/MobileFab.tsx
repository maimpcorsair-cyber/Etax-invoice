import { Link, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useCompanyAccessPolicy } from '../hooks/useCompanyAccessPolicy';

export default function MobileFab() {
  const { policy } = useCompanyAccessPolicy();
  const location = useLocation();
  const disabled = policy?.canCreateInvoice === false;

  if (location.pathname.includes('/invoices/new') || location.pathname.includes('/edit')) {
    return null;
  }

  if (disabled) {
    return (
      <div
        className="fixed bottom-20 right-5 z-40 lg:hidden w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg opacity-50 cursor-not-allowed"
        aria-disabled="true"
        aria-label="สร้างใบกำกับภาษี / Create Invoice"
      >
        <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
      </div>
    );
  }

  return (
    <Link
      to="/app/invoices/new"
      className="fixed bottom-20 right-5 z-40 lg:hidden w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
      aria-label="สร้างใบกำกับภาษี / Create Invoice"
    >
      <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
    </Link>
  );
}
