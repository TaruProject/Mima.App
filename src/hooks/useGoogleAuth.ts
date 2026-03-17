import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export function useGoogleAuth() {
  const { t } = useTranslation();
  const { user, session } = useAuth();
  
  const [isConnected, setIsConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const getAuthHeaders = useCallback(() => {
    return {
      'Authorization': `Bearer ${session?.access_token}`
    };
  }, [session]);

  const checkConnectionStatus = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/auth/status`, { headers });
      if (response.ok) {
        const data = await response.json();
        setIsConnected(data.isConnected);
      }
    } catch (error) {
      console.error("Failed to check status", error);
    }
  }, [getAuthHeaders]);

  const handleConnect = async () => {
    try {
      setAuthError(null);
      const headers = getAuthHeaders();
      const response = await fetch(`/api/auth/url`, { headers });
      
      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }
      const { url } = await response.json();

      // Redirect to Google OAuth (full page redirect, not popup)
      window.location.href = url;
    } catch (error) {
      console.error('OAuth error:', error);
      setAuthError(t('common.auth_failed'));
    }
  };

  // Check for OAuth callback params on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const googleConnected = urlParams.get('google_connected');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (googleConnected === 'true') {
      console.log('Google OAuth successful');
      setIsConnected(true);
      setAuthError(null);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Refresh status to confirm
      checkConnectionStatus();
    } else if (error === 'google_auth_failed') {
      const errorMsg = errorDescription || t('common.auth_failed');
      console.error('Google OAuth failed:', errorMsg);
      setAuthError(errorMsg);
      setIsConnected(false);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [t, checkConnectionStatus]);

  useEffect(() => {
    if (user) {
      checkConnectionStatus();
    }
  }, [user, checkConnectionStatus]);

  return {
    isConnected,
    setIsConnected,
    authError,
    setAuthError,
    handleConnect,
    checkConnectionStatus,
    getAuthHeaders,
    session,
    user
  };
}
