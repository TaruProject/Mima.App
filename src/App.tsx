import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import Layout from "./components/Layout";
import Chat from "./pages/Chat";
import Calendar from "./pages/Calendar";
import Inbox from "./pages/Inbox";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import UpdateOverlay from "./components/UpdateOverlay";
import InstallPWA from "./components/InstallPWA";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Fallback component if the backend is not running and React handles the callback
function OAuthCallbackFallback() {
  return (
    <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Backend Not Running</h2>
      <p className="text-slate-400 max-w-md">
        The Google authentication callback reached the frontend React app instead of the Express backend. 
        This means your Node.js server (server.ts) is not running on your hosting provider.
      </p>
      <button 
        onClick={() => window.close()}
        className="mt-8 px-6 py-2 bg-surface-highlight text-white rounded-full hover:bg-surface-light transition-colors"
      >
        Close Window
      </button>
    </div>
  );
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
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setInterval(() => {
          r.update();
        }, 15 * 60 * 1000); // Check every 15 minutes
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const { user } = useAuth();

  useEffect(() => {
    // Check for updates when the app comes back to focus
    const handleFocus = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.update();
        });
      }
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    });
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleFocus);
    };
  }, []);

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  return (
    <>
      {needRefresh && <UpdateOverlay onUpdate={handleUpdate} />}
      <InstallPWA />
      <Routes>
        <Route path="/auth/callback/google" element={<OAuthCallbackFallback />} />
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
