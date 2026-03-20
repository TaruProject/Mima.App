import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

export function useGoogleConnection() {
  const { t } = useTranslation();
  const { user, session } = useAuth();

  const [isConnected, setIsConnected] = useState<boolean | null>(null); // null means checking
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const getAuthHeaders = useCallback(() => {
    if (!session?.access_token) return {};
    return {
      'Authorization': `Bearer ${session.access_token}`
    };
  }, [session]);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/status', {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsConnected(data.isConnected);
        setError(null);
        setErrorCode(null);
      } else {
        setIsConnected(false);
      }
    } catch (err) {
      console.error("Failed to check Google connection status:", err);
      setIsConnected(false);
    }
  }, [getAuthHeaders]);

  const connect = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      setErrorCode(null);

      const response = await fetch('/api/auth/url', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }

      const { url } = await response.json();
      
      // Full page redirect for OAuth
      window.location.href = url;
    } catch (err: any) {
      console.error("Google connection error:", err);
      setError(t('common.auth_failed'));
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    // Optional: Implement selective disconnect if needed
    // For now, we'll just set local state and maybe call an endpoint to clear tokens
    setIsConnected(false);
  };

  // Handle URL params after redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('google_connected');
    const authError = params.get('error');
    const errorDesc = params.get('error_description') || params.get('message');

    if (connected === 'true') {
      setIsConnected(true);
      // Clean up URL
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    } else if (authError === 'google_auth_failed') {
      setIsConnected(false);
      setError(errorDesc || t('common.auth_failed'));
      setErrorCode('AUTH_FAILED');
      // Clean up URL
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, [t]);

  // Check status on mount and when user changes
  useEffect(() => {
    if (user) {
      checkStatus();
    } else {
      setIsConnected(false);
    }
  }, [user, checkStatus]);

  return {
    isConnected,
    isConnecting,
    error,
    errorCode,
    connect,
    disconnect,
    checkStatus,
    getAuthHeaders
  };
}
