import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Chat from "./pages/Chat";
import Calendar from "./pages/Calendar";
import Inbox from "./pages/Inbox";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import UpdateOverlay from "./components/UpdateOverlay";
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
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const checkVersion = async () => {
      // In a real app, this would fetch from an API
    };
    checkVersion();
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  return (
    <>
      {needsUpdate && <UpdateOverlay onUpdate={handleUpdate} />}
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
