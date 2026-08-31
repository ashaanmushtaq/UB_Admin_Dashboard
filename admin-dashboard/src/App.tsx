import React, { useEffect, useState } from 'react';
import { checkSupabaseConnection } from './lib/supabase';

export function App() {
  const [status, setStatus] = useState<{ loading: boolean; connected: boolean; message: string }>({
    loading: true,
    connected: false,
    message: 'Testing connection...'
  });

  useEffect(() => {
    checkSupabaseConnection().then(res => {
      setStatus({
        loading: false,
        connected: res.connected,
        message: res.message
      });
    });
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '2rem'
    }}>
      <header style={{
        maxWidth: '1200px',
        margin: '0 auto 2rem auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #1e293b',
        paddingBottom: '1.5rem'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8' }}>
            UB Collection - Admin Web Dashboard
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Multi-Tenant Garments Wholesale ERP System
          </p>
        </div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          borderRadius: '9999px',
          backgroundColor: status.loading ? '#334155' : status.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${status.loading ? '#475569' : status.connected ? '#10b981' : '#ef4444'}`,
          color: status.loading ? '#cbd5e1' : status.connected ? '#34d399' : '#f87171',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: status.loading ? '#94a3b8' : status.connected ? '#10b981' : '#ef4444'
          }} />
          {status.loading ? 'Checking Supabase...' : status.connected ? 'Supabase Connected' : 'Supabase Config Ready'}
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginBottom: '2rem',
          border: '1px solid #334155'
        }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, color: '#e2e8f0' }}>Backend Connection Verification</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.95rem', marginBottom: 0 }}>
            <strong>Status:</strong> {status.message}
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem'
        }}>
          <div style={{ backgroundColor: '#1e293b', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '1rem' }}>Module 0: Foundation</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Multi-Tenant Postgres Schema, Supabase Auth, RBAC Roles, Product & Variant Catalog</p>
          </div>
          <div style={{ backgroundColor: '#1e293b', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '1rem' }}>Module 1: Fabric Ledger</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Supplier Directory, Fabric Procurement, Payment Methods, Auto Balances & Running Ledger</p>
          </div>
          <div style={{ backgroundColor: '#1e293b', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '1rem' }}>Module 2: Employee Payroll</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>Staff Roles, Wage Terms, Piece-Rate Work Logs, Advance Payouts & In-App Alerts</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
