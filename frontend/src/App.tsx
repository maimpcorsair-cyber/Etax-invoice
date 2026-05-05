import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// Layout shells stay eagerly loaded — they render immediately as route wrappers
import Layout from './components/Layout';
import OwnerLayout from './components/OwnerLayout';
import HardcodedChineseBridge from './components/HardcodedChineseBridge';
// All pages are lazy-loaded so each becomes its own JS chunk
const Landing = React.lazy(() => import('./pages/Landing'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const InvoiceBuilder = React.lazy(() => import('./pages/InvoiceBuilder'));
const InvoiceList = React.lazy(() => import('./pages/InvoiceList'));
const AdminPanel = React.lazy(() => import('./pages/AdminPanel'));
const AuditLogs = React.lazy(() => import('./pages/AuditLogs'));
const Login = React.lazy(() => import('./pages/Login'));
const Customers = React.lazy(() => import('./pages/Customers'));
const CustomerStatementPage = React.lazy(() => import('./pages/CustomerStatement'));
const Products = React.lazy(() => import('./pages/Products'));
const BillingSuccess = React.lazy(() => import('./pages/BillingSuccess'));
const BillingCancel = React.lazy(() => import('./pages/BillingCancel'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./pages/TermsOfService'));
const ContactPage = React.lazy(() => import('./pages/ContactPage'));
const OwnerOverview = React.lazy(() => import('./pages/OwnerOverview'));
const OwnerTenants = React.lazy(() => import('./pages/OwnerTenants'));
const OwnerTransactions = React.lazy(() => import('./pages/OwnerTransactions'));
const OwnerCoupons = React.lazy(() => import('./pages/OwnerCoupons'));
const OwnerRenewals = React.lazy(() => import('./pages/OwnerRenewals'));
const PlanPage = React.lazy(() => import('./pages/PlanPage'));
const InvoiceVerify = React.lazy(() => import('./pages/InvoiceVerify'));
const PurchaseInvoices = React.lazy(() => import('./pages/PurchaseInvoices'));
const Expenses = React.lazy(() => import('./pages/Expenses'));
const VatSummary = React.lazy(() => import('./pages/VatSummary'));
const Pp30Filing = React.lazy(() => import('./pages/Pp30Filing'));
const WhtCertificateList = React.lazy(() => import('./pages/WhtCertificateList'));
import { useAuthStore } from './store/authStore';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { usePushNotifications } from './hooks/usePushNotifications';
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
    window.location.replace(
      buildPlaneUrl('/app/dashboard', 'app', user ? { token, user } : undefined)
    );
    return null;
  }
  if (surface === 'app' && user?.role === 'super_admin') {
    window.location.replace(
      buildPlaneUrl('/ops/overview', 'ops', user ? { token, user } : undefined)
    );
    return null;
  }
  if (surface === 'apex') {
    window.location.replace(
      user?.role === 'super_admin'
        ? buildPlaneUrl('/ops/overview', 'ops', user ? { token, user } : undefined)
        : buildPlaneUrl('/app/dashboard', 'app', user ? { token, user } : undefined)
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
    window.location.replace(
      buildPlaneUrl('/app/dashboard', 'app', user ? { token, user } : undefined)
    );
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
  usePushNotifications();
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
    <>
      <HardcodedChineseBridge />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route
            path="/"
            element={
              surface === 'ops' ? (
                <Navigate to="/ops/login" replace />
              ) : surface === 'app' ? (
                <Navigate to="/login" replace />
              ) : (
                <Landing />
              )
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/ops/login" element={<Login />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/billing/success" element={<BillingSuccess />} />
          <Route path="/billing/cancel" element={<BillingCancel />} />
          <Route path="/invoices/verify/:id" element={<InvoiceVerify />} />
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
            <Route path="purchase-invoices" element={<PurchaseInvoices />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="vat-summary" element={<VatSummary />} />
            <Route path="pp30" element={<Pp30Filing />} />
            <Route path="wht-certificates" element={<WhtCertificateList />} />
            <Route path="admin" element={<AdminPanel />} />
            <Route path="audit" element={<AuditLogs />} />
            <Route path="plan" element={<PlanPage />} />
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
          <Route
            path="*"
            element={
              <Navigate
                to={surface === 'ops' ? '/ops/login' : surface === 'app' ? '/login' : '/'}
                replace
              />
            }
          />
        </Routes>
      </Suspense>
    </>
  );
}
