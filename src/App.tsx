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
