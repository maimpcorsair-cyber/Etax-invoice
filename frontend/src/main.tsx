import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initSentry, Sentry } from './lib/sentry';
import App from './App';
import './i18n';
import './index.css';

// Initialize Sentry before React renders so first-paint errors are captured.
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '40px auto' }}>
        <h1 style={{ color: '#dc2626' }}>⚠️ เกิดข้อผิดพลาด</h1>
        <p style={{ color: '#555' }}>ระบบขัดข้อง — ทีมพัฒนาได้รับแจ้งแล้ว</p>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto' }}>
          {error instanceof Error ? error.message : String(error)}
        </pre>
        <button onClick={resetError} style={{ marginTop: 12, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          ลองใหม่
        </button>
      </div>
    )}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
