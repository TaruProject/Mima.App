import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Layout from './components/Layout';
import Chat from './pages/Chat';
import Calendar from './pages/Calendar';
import Inbox from './pages/Inbox';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import GoogleCallback from './pages/GoogleCallback';
import UpdateOverlay from './components/UpdateOverlay';
import InstallPWA from './components/InstallPWA';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { BUILD_ID, BUILD_VERSION } from './generated/buildInfo';

const MAX_UPDATE_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const VERSION_CHECK_INTERVAL_MS = 20 * 1000;

function compareSemver(a: string, b: string): number {
  const parseVersion = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-dark flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const swUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const versionCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingVersionRef = useRef(false);
  const updateRetryRef = useRef(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [forceUpdateRequired, setForceUpdateRequired] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [versionLabel, setVersionLabel] = useState<string | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        swUpdateIntervalRef.current = setInterval(() => {
          void r.update();
        }, VERSION_CHECK_INTERVAL_MS);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
    immediate: true,
  });

  useEffect(() => {
    return () => {
      if (swUpdateIntervalRef.current) {
        clearInterval(swUpdateIntervalRef.current);
      }
      if (versionCheckIntervalRef.current) {
        clearInterval(versionCheckIntervalRef.current);
      }
    };
  }, []);

  const { user } = useAuth();

  const checkServerVersion = useCallback(async () => {
    if (isCheckingVersionRef.current) return;
    isCheckingVersionRef.current = true;

    try {
      const response = await fetch(`/api/version?ts=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;

      const data = await response.json();
      if (!data?.deployId) return;

      setVersionLabel(data.version || BUILD_VERSION || null);
      setNetworkError(false);

      const serverVersion = data.version || BUILD_VERSION;
      const minSupported = data.minSupported || serverVersion;

      if (data.forceUpdate && compareSemver(BUILD_VERSION, minSupported) < 0) {
        setForceUpdateRequired(true);
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) => registration.update().catch(() => undefined))
          );
        }
        return;
      }

      if (data.deployId !== BUILD_ID) {
        setForceUpdateRequired(true);
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) => registration.update().catch(() => undefined))
          );
        }
        return;
      }

      setForceUpdateRequired(false);
    } catch (error) {
      console.error('Failed to check deployed version:', error);
      setNetworkError(true);
    } finally {
      isCheckingVersionRef.current = false;
    }
  }, []);

  useEffect(() => {
    const runUpdateCheck = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => registration.update())
          .catch(() => undefined);
      }
      void checkServerVersion();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runUpdateCheck();
      }
    };

    window.addEventListener('focus', runUpdateCheck);
    window.addEventListener('pageshow', runUpdateCheck);
    window.addEventListener('online', () => {
      setNetworkError(false);
      runUpdateCheck();
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    versionCheckIntervalRef.current = setInterval(() => {
      void checkServerVersion();
    }, VERSION_CHECK_INTERVAL_MS);

    runUpdateCheck();

    return () => {
      window.removeEventListener('focus', runUpdateCheck);
      window.removeEventListener('pageshow', runUpdateCheck);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkServerVersion]);

  const handleUpdate = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    setNetworkError(false);

    let reloaded = false;
    const forceReload = () => {
      if (reloaded) return;
      reloaded = true;
      const url = new URL(window.location.href);
      url.searchParams.set('update', `${Date.now()}`);
      url.searchParams.set('build', BUILD_ID);
      window.location.replace(url.toString());
    };

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();

        await Promise.all(
          registrations.map(async (registration) => {
            await registration.update().catch(() => undefined);
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          })
        );

        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            forceReload();
          },
          { once: true }
        );

        await updateServiceWorker(true).catch(() => undefined);
        await Promise.all(
          registrations.map((registration) => registration.unregister().catch(() => false))
        );
      }

      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      }

      setForceUpdateRequired(false);
      window.setTimeout(forceReload, 600);
    } catch (error) {
      console.error('Failed to apply service worker update:', error);
      updateRetryRef.current += 1;

      if (updateRetryRef.current >= MAX_UPDATE_RETRIES) {
        setNetworkError(true);
        setIsUpdating(false);
        return;
      }

      setIsUpdating(false);
      window.setTimeout(() => {
        void handleUpdate();
      }, RETRY_DELAY_MS);
    }
  };

  const showOverlay = needRefresh || forceUpdateRequired;

  return (
    <>
      {showOverlay && (
        <UpdateOverlay
          onUpdate={handleUpdate}
          isUpdating={isUpdating}
          versionLabel={versionLabel}
          networkError={networkError}
          retryCount={updateRetryRef.current}
          maxRetries={MAX_UPDATE_RETRIES}
        />
      )}
      <InstallPWA />
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
        <Route path="/api/auth/callback/google" element={<GoogleCallback />} />
        <Route path="/auth/callback/google" element={<GoogleCallback />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Chat />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
