import { useEffect, useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { onAuthStateChange, getProfile, isSuperAdmin, getTenantBranding } from './lib/auth';
import type { UserProfile, TenantBranding } from './lib/auth';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SuperAdminPage } from './pages/SuperAdminPage';

type AuthState = 'loading' | 'unauthenticated' | 'authenticated' | 'super_admin';

export function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const resolvedRef = useRef(false);

  async function loadUserData(u: User) {
    try {
      const p = await getProfile(u);
      setProfile(p);
      if (p?.tenant_id) {
        const b = await getTenantBranding(p.tenant_id);
        setBranding(b);
      } else {
        setBranding(null);
      }
    } catch (err) {
      console.warn('[Auth] loadUserData encountered error:', err);
      setProfile(null);
      setBranding(null);
    }
  }

  useEffect(() => {
    // ── Timeout safety net: if nothing resolves in 5s, show login ──
    const timeoutId = setTimeout(() => {
      if (!resolvedRef.current) {
        console.warn('[Auth] Startup timed out after 5s — showing login screen');
        resolvedRef.current = true;
        setUser(null);
        setProfile(null);
        setBranding(null);
        setAuthState('unauthenticated');
      }
    }, 5000);

    // ── Step 1: Resolve initial session immediately (no waiting for change event) ──
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.warn('[Auth] getSession error:', error.message);
      }
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        clearTimeout(timeoutId);
        if (session?.user) {
          setUser(session.user);
          try {
            const isSuper = await isSuperAdmin().catch(() => false);
            if (isSuper) {
              setProfile(null);
              setBranding(null);
              setAuthState('super_admin');
            } else {
              await loadUserData(session.user);
              setAuthState('authenticated');
            }
          } catch (err) {
            console.warn('[Auth] Session resolution error:', err);
            setAuthState('authenticated');
          }
        } else {
          setUser(null);
          setProfile(null);
          setBranding(null);
          setAuthState('unauthenticated');
        }
      }
    }).catch(err => {
      console.warn('[Auth] getSession threw:', err);
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        clearTimeout(timeoutId);
        setAuthState('unauthenticated');
      }
    });

    // ── Step 2: Subscribe to subsequent auth state changes ──
    const subscription = onAuthStateChange(async (u) => {
      // After initial resolution, keep tracking sign-in / sign-out
      setUser(u);
      if (u) {
        try {
          const isSuper = await isSuperAdmin().catch(() => false);
          if (isSuper) {
            setProfile(null);
            setBranding(null);
            setAuthState('super_admin');
          } else {
            await loadUserData(u);
            setAuthState('authenticated');
          }
        } catch (err) {
          console.warn('[Auth] onAuthStateChange resolution error:', err);
          setAuthState('authenticated');
        }
      } else {
        setProfile(null);
        setBranding(null);
        setAuthState('unauthenticated');
      }
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  async function handleLoginSuccess() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        const isSuper = await isSuperAdmin().catch(() => false);
        if (isSuper) {
          setProfile(null);
          setBranding(null);
          setAuthState('super_admin');
        } else {
          await loadUserData(session.user);
          setAuthState('authenticated');
        }
      }
    } catch (err) {
      console.warn('[Auth] handleLoginSuccess error:', err);
    }
  }

  if (authState === 'loading') {
    return <SplashScreen />;
  }

  if (authState === 'unauthenticated' || !user) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  if (authState === 'super_admin') {
    return <SuperAdminPage user={user} />;
  }

  return (
    <DashboardPage
      user={user}
      profile={profile}
      branding={branding}
      onRefreshUserData={() => (user ? loadUserData(user) : undefined)}
    />
  );
}

function SplashScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: '48px', height: '48px',
          border: '3px solid var(--accent-glow)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>
          Loading ERP Portal…
        </p>
      </div>
    </div>
  );
}

export default App;
