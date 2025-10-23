import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useApi } from '../lib/hooks/useApi';

interface VoiceSlot {
  slot: 'EN1' | 'EN2' | 'EN3' | 'PL';
  language: 'en' | 'pl';
  voice_id: string;
}

interface VoiceSlotEditorProps {}

export default function VoiceSlotEditor({}: VoiceSlotEditorProps) {
  const [voiceSlots, setVoiceSlots] = useState<VoiceSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const { fetch } = useApi();

  // Load voice slots on mount
  useEffect(() => {
    loadVoiceSlots();
  }, []);

  const loadVoiceSlots = async () => {
    try {
      const response = await fetch('/api/user-voices');
      if (response.ok) {
        const data = await response.json();
        // Always show all 4 slots, merge with database data
        const defaultSlots: VoiceSlot[] = [
          { slot: 'EN1', language: 'en', voice_id: '' },
          { slot: 'EN2', language: 'en', voice_id: '' },
          { slot: 'EN3', language: 'en', voice_id: '' },
          { slot: 'PL', language: 'pl', voice_id: '' },
        ];

        if (data.slots && data.slots.length > 0) {
          // Merge database data with default slots
          const mergedSlots = defaultSlots.map(defaultSlot => {
            const dbSlot = data.slots.find(slot => slot.slot === defaultSlot.slot);
            if (dbSlot) {
              return {
                ...dbSlot,
                language: dbSlot.slot.startsWith('EN') ? 'en' : 'pl'
              };
            }
            return defaultSlot;
          });
          setVoiceSlots(mergedSlots);
        } else {
          setVoiceSlots(defaultSlots);
        }
      }
    } catch (error) {
      console.error('Failed to load voice slots:', error);
      // Set default slots on error
      const defaultSlots: VoiceSlot[] = [
        { slot: 'EN1', language: 'en', voice_id: '' },
        { slot: 'EN2', language: 'en', voice_id: '' },
        { slot: 'EN3', language: 'en', voice_id: '' },
        { slot: 'PL', language: 'pl', voice_id: '' },
      ];
      setVoiceSlots(defaultSlots);
    } finally {
      setIsLoading(false);
    }
  };

  const updateVoiceSlot = (slot: 'EN1' | 'EN2' | 'EN3' | 'PL', field: 'language' | 'voice_id', value: string) => {
    setVoiceSlots(prev => prev.map(vs => 
      vs.slot === slot 
        ? { ...vs, [field]: value }
        : vs
    ));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveResult(null);

    try {
      // Save each voice slot
      const savePromises = voiceSlots.map(slot => 
        fetch(`/api/user-voices/${slot.slot}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: slot.language,
            voice_id: slot.voice_id
          }),
        })
      );

      const results = await Promise.all(savePromises);
      const allSuccessful = results.every(r => r.ok);

      if (allSuccessful) {
        setSaveResult({ success: true, message: 'Voice slots saved successfully!' });
      } else {
        setSaveResult({ success: false, message: 'Failed to save some voice slots' });
      }
    } catch (error) {
      setSaveResult({ success: false, message: 'Failed to save voice slots. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const validateConfiguration = () => {
    const enSlots = voiceSlots.filter(slot => slot.slot.startsWith('EN'));
    const enVoiceIds = enSlots.map(slot => slot.voice_id);
    
    // Check for duplicate EN voice IDs
    const duplicateVoiceIds = enVoiceIds.filter((id, index) => enVoiceIds.indexOf(id) !== index);
    if (duplicateVoiceIds.length > 0) {
      return 'EN slots must use different voice IDs';
    }

    // Check for empty voice IDs
    const emptyVoiceIds = voiceSlots.filter(slot => !slot.voice_id.trim());
    if (emptyVoiceIds.length > 0) {
      return 'All voice slots must have a voice ID';
    }

    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const validationError = validateConfiguration();

  return (
    <div className="space-y-6">
      {/* Voice Slots Configuration */}
      <div className="space-y-4">
        {voiceSlots.map((slot) => (
          <div key={slot.slot} className="p-4 border border-border rounded-lg bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-foreground">
                {slot.slot} {slot.slot.startsWith('EN') ? '(English)' : '(Polish)'}
              </h3>
              <span className={`px-2 py-1 text-xs rounded-full ${
                slot.slot.startsWith('EN') 
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              }`}>
                {slot.slot.startsWith('EN') ? 'English' : 'Polish'}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Language
                </label>
                <select
                  value={slot.language}
                  onChange={(e) => updateVoiceSlot(slot.slot, 'language', e.target.value as 'en' | 'pl')}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={slot.slot.startsWith('EN')}
                >
                  <option value="en">English</option>
                  <option value="pl">Polish</option>
                </select>
                {slot.slot.startsWith('EN') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    EN slots are fixed to English
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Voice ID
                </label>
                <input
                  type="text"
                  value={slot.voice_id}
                  onChange={(e) => updateVoiceSlot(slot.slot, 'voice_id', e.target.value)}
                  placeholder="e.g., en-US-Wavenet-A"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Google TTS voice identifier
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">
            {validationError}
          </p>
        </div>
      )}

      {/* Save Result */}
      {saveResult && (
        <div className={`p-3 rounded-lg ${
          saveResult.success 
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          <p className={`text-sm ${
            saveResult.success 
              ? 'text-green-800 dark:text-green-200' 
              : 'text-red-800 dark:text-red-200'
          }`}>
            {saveResult.message}
          </p>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving || !!validationError}
          className="min-w-[120px]"
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
            'Save Voice Slots'
          )}
        </Button>
      </div>

      {/* Help Text */}
      <div className="text-sm text-muted-foreground">
        <p className="mb-2"><strong>Configuration Rules:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>EN1, EN2, EN3 are fixed to English language and must use different voice IDs</li>
          <li>PL slot is fixed to Polish language and can use any Polish voice ID</li>
          <li>All voice IDs must be valid Google TTS voice identifiers</li>
          <li>Test your TTS credentials first to ensure voice IDs are valid</li>
        </ul>
      </div>
    </div>
  );
}
