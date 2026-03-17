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
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsConnected(true);
      } else if (event.data?.type === 'OAUTH_AUTH_FAILED') {
        setAuthError(t('common.auth_failed'));
        alert(t('common.auth_failed'));
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [t]);

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
