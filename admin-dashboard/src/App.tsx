import { useEffect, useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { onAuthStateChange, getProfile } from './lib/auth';
import type { UserProfile } from './lib/auth';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

type AuthState = 'loading' | 'unauthenticated' | 'authenticated';

export function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    // ── Timeout safety net: if nothing resolves in 5s, show login ──
    const timeoutId = setTimeout(() => {
      if (!resolvedRef.current) {
        console.warn('[Auth] Startup timed out after 5s — showing login screen');
        resolvedRef.current = true;
        setUser(null);
        setProfile(null);
        setAuthState('unauthenticated');
      }
    }, 5000);

    // ── Step 1: Resolve initial session immediately (no waiting for change event) ──
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('[Auth] getSession error:', error.message);
      }
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        clearTimeout(timeoutId);
        if (session?.user) {
          setUser(session.user);
          setAuthState('authenticated');
          getProfile(session.user).then(p => setProfile(p));
        } else {
          setUser(null);
          setProfile(null);
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
    const subscription = onAuthStateChange((u) => {
      // After initial resolution, keep tracking sign-in / sign-out
      setUser(u);
      if (u) {
        setAuthState('authenticated');
        getProfile(u).then(p => setProfile(p));
      } else {
        setProfile(null);
        setAuthState('unauthenticated');
      }
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  if (authState === 'loading') {
    return <SplashScreen />;
  }

  if (authState === 'unauthenticated' || !user) {
    return <LoginPage onSuccess={() => setAuthState('authenticated')} />;
  }

  return <DashboardPage user={user} profile={profile} />;
}

function SplashScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#090c14',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: '48px', height: '48px',
          border: '3px solid rgba(79,142,247,0.2)',
          borderTopColor: '#4f8ef7',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#4e607d', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>
          Loading UB Collection…
        </p>
      </div>
    </div>
  );
}

export default App;
