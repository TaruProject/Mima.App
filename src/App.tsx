import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import Layout from "./components/Layout";
import Chat from "./pages/Chat";
import Calendar from "./pages/Calendar";
import Inbox from "./pages/Inbox";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import GoogleCallback from "./pages/GoogleCallback";
import UpdateOverlay from "./components/UpdateOverlay";
import InstallPWA from "./components/InstallPWA";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const deployIdRef = useRef<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [forceUpdateRequired, setForceUpdateRequired] = useState(false);
  const [versionLabel, setVersionLabel] = useState<string | null>(null);
  
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        intervalRef.current = setInterval(() => {
          r.update();
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
    immediate: true,
  });

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const { user } = useAuth();

  const checkServerVersion = async () => {
    try {
      const response = await fetch(`/api/version?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;

      const data = await response.json();
      if (!data?.deployId) return;

      setVersionLabel(data.appVersion || null);

      if (!deployIdRef.current) {
        deployIdRef.current = data.deployId;
        return;
      }

      if (deployIdRef.current !== data.deployId) {
        setForceUpdateRequired(true);
      }
    } catch (error) {
      console.error("Failed to check deployed version:", error);
    }
  };

  useEffect(() => {
    // Check for updates when the app comes back to focus
    const handleFocus = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.update();
        });
      }
      void checkServerVersion();
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', handleVisibilityChange);
    void checkServerVersion();
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleUpdate = async () => {
    if (isUpdating) return;

    setIsUpdating(true);

    let reloaded = false;
    const forceReload = () => {
      if (reloaded) return;
      reloaded = true;
      const url = new URL(window.location.href);
      url.searchParams.set("update", `${Date.now()}`);
      window.location.replace(url.toString());
    };

    try {
      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      }

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            forceReload();
          },
          { once: true },
        );
      }

      await updateServiceWorker(true);
      setForceUpdateRequired(false);
      window.setTimeout(forceReload, 1500);
    } catch (error) {
      console.error('Failed to apply service worker update:', error);
      forceReload();
    }
  };

  return (
    <>
      {(needRefresh || forceUpdateRequired) && <UpdateOverlay onUpdate={handleUpdate} isUpdating={isUpdating} versionLabel={versionLabel} />}
      <InstallPWA />
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
        {/* Google OAuth callback routes - must be accessible without auth */}
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
