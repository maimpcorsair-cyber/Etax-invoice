import { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import OwnerLayout from './components/OwnerLayout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import InvoiceBuilder from './pages/InvoiceBuilder';
import InvoiceList from './pages/InvoiceList';
import AdminPanel from './pages/AdminPanel';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Customers from './pages/Customers';
import CustomerStatementPage from './pages/CustomerStatement';
import Products from './pages/Products';
import BillingSuccess from './pages/BillingSuccess';
import BillingCancel from './pages/BillingCancel';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import ContactPage from './pages/ContactPage';
import OwnerOverview from './pages/OwnerOverview';
import OwnerTenants from './pages/OwnerTenants';
import OwnerTransactions from './pages/OwnerTransactions';
import OwnerCoupons from './pages/OwnerCoupons';
import OwnerRenewals from './pages/OwnerRenewals';
import { useAuthStore } from './store/authStore';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { buildPlaneUrl, detectSurface, getPlanePath } from './lib/platform';
import { isNative } from './hooks/useNative';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, authReady, user } = useAuthStore();
  const surface = detectSurface();
  if (!authReady) return <LoadingSpinner />;
  if (!token) {
    if (surface === 'ops') {
      window.location.replace(getPlanePath('/login', 'app'));
      return null;
    }
    if (surface === 'apex') {
      window.location.replace(getPlanePath('/login', 'app'));
      return null;
    }
    return <Navigate to="/login" replace />;
  }
  if (surface === 'ops' && user?.role !== 'super_admin') {
    window.location.replace(buildPlaneUrl('/app/dashboard', 'app', user ? { token, user } : undefined));
    return null;
  }
  if (surface === 'apex') {
    window.location.replace(
      user?.role === 'super_admin'
        ? buildPlaneUrl('/ops/overview', 'ops', user ? { token, user } : undefined)
        : buildPlaneUrl('/app/dashboard', 'app', user ? { token, user } : undefined),
    );
    return null;
  }
  return <>{children}</>;
}

function OwnerRoute({ children }: { children: React.ReactNode }) {
  const { token, authReady, user } = useAuthStore();
  const surface = detectSurface();
  if (!authReady) return <LoadingSpinner />;
  if (!token) {
    if (surface === 'app' || surface === 'apex') {
      window.location.replace(getPlanePath('/login', 'ops'));
      return null;
    }
    return <Navigate to="/ops/login" replace />;
  }
  if (user?.role !== 'super_admin') {
    window.location.replace(buildPlaneUrl('/app/dashboard', 'app', user ? { token, user } : undefined));
    return null;
  }
  return <>{children}</>;
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
    </div>
  );
}

export default function App() {
  const { i18n } = useTranslation();
  useAuthBootstrap();
  const surface = detectSurface();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // ── Capacitor native init ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isNative()) return;
    (async () => {
      try {
        // Set status bar style (blue brand colour)
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#1d4ed8' });
      } catch {
        // StatusBar not available on all platforms — ignore
      }
    })();
  }, []);

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route
          path="/"
          element={
            surface === 'ops'
              ? <Navigate to="/ops/login" replace />
              : surface === 'app'
                ? <Navigate to="/login" replace />
                : <Landing />
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/ops/login" element={<Login />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/billing/success" element={<BillingSuccess />} />
        <Route path="/billing/cancel" element={<BillingCancel />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="invoices" element={<InvoiceList />} />
          <Route path="invoices/new" element={<InvoiceBuilder />} />
          <Route path="invoices/:id/edit" element={<InvoiceBuilder />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id/statement" element={<CustomerStatementPage />} />
          <Route path="products" element={<Products />} />
          <Route path="admin" element={<AdminPanel />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route
          path="/ops"
          element={
            <OwnerRoute>
              <OwnerLayout />
            </OwnerRoute>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OwnerOverview />} />
          <Route path="tenants" element={<OwnerTenants />} />
          <Route path="transactions" element={<OwnerTransactions />} />
          <Route path="coupons" element={<OwnerCoupons />} />
          <Route path="renewals" element={<OwnerRenewals />} />
        </Route>
        <Route path="*" element={<Navigate to={surface === 'ops' ? '/ops/login' : surface === 'app' ? '/login' : '/'} replace />} />
      </Routes>
    </Suspense>
  );
}
