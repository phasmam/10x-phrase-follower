import { useState, useEffect } from 'react';
import { useApi } from '../lib/hooks/useApi';

interface TtsCredentialsState {
  is_configured: boolean;
  last_validated_at?: string;
  key_fingerprint?: string;
}

interface ConfigStatusBadgeProps {}

export default function ConfigStatusBadge({}: ConfigStatusBadgeProps) {
  const [credentialsState, setCredentialsState] = useState<TtsCredentialsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { fetch } = useApi();

  useEffect(() => {
    loadCredentialsState();
  }, []);

  const loadCredentialsState = async () => {
    try {
      const response = await fetch('/api/tts-credentials');
      if (response.ok) {
        const data = await response.json();
        setCredentialsState(data);
      }
    } catch (error) {
      console.error('Failed to load TTS credentials state:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (credentialsState?.is_configured) {
    return (
      <div className="flex items-center">
        <svg className="h-4 w-4 text-green-600 dark:text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          TTS: Configured
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <svg className="h-4 w-4 text-red-600 dark:text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
      <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
        TTS: Not configured
      </span>
    </div>
  );
}
