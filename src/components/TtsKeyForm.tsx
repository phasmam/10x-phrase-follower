import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useApi } from '../lib/hooks/useApi';

interface TtsCredentialsState {
  is_configured: boolean;
  last_validated_at?: string;
  key_fingerprint?: string;
}

interface TtsKeyFormProps {}

export default function TtsKeyForm({}: TtsKeyFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [credentialsState, setCredentialsState] = useState<TtsCredentialsState | null>(null);
  const { fetch } = useApi();

  // Load current credentials state
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
    }
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/tts-credentials/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, provider: 'google' }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({ success: true, message: 'TTS credentials are valid!' });
      } else {
        setTestResult({ 
          success: false, 
          message: data.message || 'TTS credentials test failed' 
        });
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: 'Failed to test credentials. Please try again.' 
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Please enter an API key' });
      return;
    }

    if (!testResult?.success) {
      setTestResult({ success: false, message: 'Please test your credentials first' });
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch('/api/tts-credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_api_key: apiKey }),
      });

      const data = await response.json();

      if (response.ok) {
        setCredentialsState(data);
        setTestResult({ success: true, message: 'TTS credentials saved successfully!' });
        setApiKey(''); // Clear the form
      } else {
        setTestResult({ 
          success: false, 
          message: data.message || 'Failed to save credentials' 
        });
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: 'Failed to save credentials. Please try again.' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Status */}
      {credentialsState?.is_configured && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                TTS is configured
              </p>
              {credentialsState.last_validated_at && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Last validated: {new Date(credentialsState.last_validated_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* API Key Input */}
      <div>
        <label htmlFor="api-key" className="block text-sm font-medium text-foreground mb-2">
          Google TTS API Key
        </label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your Google TTS API key"
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Your API key is encrypted and never stored in plain text
        </p>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`p-3 rounded-lg ${
          testResult.success 
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <p className={`text-sm ${
            testResult.success 
              ? 'text-green-800 dark:text-green-200' 
              : 'text-red-800 dark:text-red-200'
          }`}>
            {testResult.message}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <Button
          onClick={handleTest}
          disabled={isTesting || !apiKey.trim()}
          variant="outline"
          className="flex-1"
        >
          {isTesting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Testing...
            </>
          ) : (
            'Test Credentials'
          )}
        </Button>
        
        <Button
          onClick={handleSave}
          disabled={isSaving || !testResult?.success}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            'Save Credentials'
          )}
        </Button>
      </div>
    </div>
  );
}
