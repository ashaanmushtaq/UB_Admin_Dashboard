import React, { useEffect, useState } from 'react';
import { checkSupabaseConnection } from './lib/supabase';

export function App() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [status, setStatus] = useState<{ loading: boolean; connected: boolean; message: string }>({
    loading: true,
    connected: false,
    message: 'Testing POS connectivity...'
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    checkSupabaseConnection().then(res => {
      setStatus({
        loading: false,
        connected: res.connected,
        message: res.message
      });
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d16',
      color: '#f1f5f9',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '1.5rem'
    }}>
      <header style={{
        backgroundColor: '#1e293b',
        padding: '1rem 1.5rem',
        borderRadius: '0.75rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        border: '1px solid #334155'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#38bdf8', fontWeight: 700 }}>
            UB Collection - POS Counter PWA
          </h1>
          <p style={{ margin: '0.2rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
            Offline-First Shop Counter Interface
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Network Status Badge */}
          <span style={{
            padding: '0.35rem 0.85rem',
            borderRadius: '9999px',
            backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            color: isOnline ? '#34d399' : '#fbbf24',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: `1px solid ${isOnline ? '#10b981' : '#f59e0b'}`
          }}>
            {isOnline ? 'Network Online' : 'Offline Mode Active'}
          </span>

          {/* Supabase Status Badge */}
          <span style={{
            padding: '0.35rem 0.85rem',
            borderRadius: '9999px',
            backgroundColor: status.connected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: status.connected ? '#38bdf8' : '#f87171',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: `1px solid ${status.connected ? '#0284c7' : '#ef4444'}`
          }}>
            {status.loading ? 'Checking...' : status.connected ? 'Supabase Sync Ready' : 'Supabase Config Ready'}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '1px solid #334155'
        }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, color: '#f8fafc' }}>POS Service Worker & Supabase Status</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
            <strong>Connection Message:</strong> {status.message}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 0 }}>
            PWA service worker configured for offline caching and local database sync for counter sales.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
