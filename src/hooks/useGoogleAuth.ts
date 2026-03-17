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

      const authWindow = window.open(
        url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
        setAuthError(t('common.allow_popups'));
        alert(t('common.allow_popups'));
      }
    } catch (error) {
      console.error('OAuth error:', error);
      setAuthError(t('common.auth_failed'));
    }
  };

  useEffect(() => {
    if (user) {
      checkConnectionStatus();
    }
  }, [user, checkConnectionStatus]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from the same origin or trusted origins
      if (event.origin !== window.location.origin && 
          !event.origin.includes('mima-app.com') &&
          !event.origin.includes('localhost')) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log('OAuth success message received');
        setIsConnected(true);
        setAuthError(null);
        // Refresh connection status to ensure tokens are properly stored
        checkConnectionStatus();
      } else if (event.data?.type === 'OAUTH_AUTH_FAILED') {
        const errorMsg = event.data?.error || t('common.auth_failed');
        console.error('OAuth failed:', errorMsg);
        setAuthError(errorMsg);
        setIsConnected(false);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [t, checkConnectionStatus]);

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
