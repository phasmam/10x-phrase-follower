import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { useApi } from "../lib/hooks/useApi";
import { ToastProvider, useToast } from "./ui/toast";
import GenerateAudioButton from "./GenerateAudioButton";
import type { PhraseDTO, PhraseListResponse, NotebookDTO, JobDTO } from "../types";

interface NotebookViewProps {
  notebookId: string;
}

interface NotebookState {
  notebook: NotebookDTO | null;
  phrases: PhraseDTO[];
  isLoading: boolean;
  error: string | null;
  activeJob: JobDTO | null;
}

// Internal component that uses toast
function NotebookViewContent({ notebookId }: NotebookViewProps) {
  const { apiCall, isAuthenticated } = useApi();
  const { addToast } = useToast();
  const [state, setState] = useState<NotebookState>({
    notebook: null,
    phrases: [],
    isLoading: true,
    error: null,
    activeJob: null,
  });

  // Load notebook and phrases
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        // Load phrases (we'll get notebook info from the first phrase or use a fallback)
        const phrasesData = await apiCall<PhraseListResponse>(
          `/api/notebooks/${notebookId}/phrases`,
          { method: "GET" }
        );

        // Create a mock notebook object since we don't have the GET endpoint working
        const mockNotebook: NotebookDTO = {
          id: notebookId,
          name: "Loading...", // We'll update this if we can get it from somewhere
          current_build_id: null,
          last_generate_job_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        setState(prev => ({
          ...prev,
          notebook: mockNotebook,
          phrases: phrasesData.items,
          isLoading: false,
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to load notebook",
        }));
      }
    };

    loadData();
  }, [notebookId, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle phrase deletion
  const handleDeletePhrase = async (phraseId: string) => {
    if (!confirm("Are you sure you want to delete this phrase?")) return;

    try {
      await apiCall(`/api/phrases/${phraseId}`, {
        method: "DELETE",
      });

      // Remove from local state
      setState(prev => ({
        ...prev,
        phrases: prev.phrases.filter(p => p.id !== phraseId),
      }));

      // Show success toast
      addToast({
        type: "success",
        title: "Phrase deleted",
        description: "The phrase has been successfully removed.",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete phrase";
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
      }));

      // Show error toast
      addToast({
        type: "error",
        title: "Delete failed",
        description: errorMessage,
      });
    }
  };

  // Handle phrase reorder
  const handleMovePhrase = async (phraseId: string, direction: "up" | "down") => {
    const currentPhrase = state.phrases.find(p => p.id === phraseId);
    if (!currentPhrase) return;

    const currentIndex = state.phrases.findIndex(p => p.id === phraseId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= state.phrases.length) return;

    const targetPhrase = state.phrases[targetIndex];
    
    try {
      // Call reorder API
      await apiCall(`/api/notebooks/${notebookId}/phrases/reorder`, {
        method: "POST",
        body: JSON.stringify({
          moves: [
            { phrase_id: currentPhrase.id, position: targetPhrase.position },
            { phrase_id: targetPhrase.id, position: currentPhrase.position },
          ]
        }),
      });

      // Update local state optimistically
      const newPhrases = [...state.phrases];
      [newPhrases[currentIndex], newPhrases[targetIndex]] = [newPhrases[targetIndex], newPhrases[currentIndex]];
      
      setState(prev => ({
        ...prev,
        phrases: newPhrases,
      }));

      addToast({
        type: "success",
        title: "Phrase reordered",
        description: "The phrase position has been updated.",
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reorder phrase";
      
      addToast({
        type: "error",
        title: "Reorder failed",
        description: errorMessage,
      });
    }
  };

  // Handle job creation
  const handleJobCreated = (job: JobDTO) => {
    setState(prev => ({
      ...prev,
      activeJob: job,
    }));
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Authentication required</p>
      </div>
    );
  }

  if (state.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 bg-muted animate-pulse rounded w-48"></div>
          <a href="/notebooks" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Notebooks
          </a>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">Notebook</h1>
          <a href="/notebooks" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Notebooks
          </a>
        </div>
        <div className="p-4 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {state.notebook?.name || "Notebook"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {state.phrases.length} phrases
          </p>
        </div>
        <a 
          href="/notebooks" 
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Notebooks
        </a>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{state.error}</p>
        </div>
      )}

      {/* Active job status */}
      {state.activeJob && (
        <div className="p-3 rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Audio generation in progress... This may take a few minutes.
            </p>
          </div>
        </div>
      )}

      {/* Phrases table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Phrases</h2>
            <div className="flex items-center gap-2">
              <a
                href={`/player/${notebookId}`}
                className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                title="Open Player"
              >
                Open Player
              </a>
              <span className="text-xs text-muted-foreground">
                Reorder temporarily disabled
              </span>
              <GenerateAudioButton 
                notebookId={notebookId}
                onJobCreated={handleJobCreated}
              />
            </div>
          </div>
        </div>

        {state.phrases.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">No phrases found in this notebook.</p>
            <a 
              href="/import" 
              className="inline-flex items-center mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Import Phrases
            </a>
          </div>
        ) : (
          <PhraseTable 
            phrases={state.phrases}
            onDelete={handleDeletePhrase}
            onMove={handleMovePhrase}
          />
        )}
      </div>
    </div>
  );
}

// Phrase Table Component
interface PhraseTableProps {
  phrases: PhraseDTO[];
  onDelete: (phraseId: string) => void;
  onMove: (phraseId: string, direction: "up" | "down") => void;
}

function PhraseTable({ phrases, onDelete, onMove }: PhraseTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-4 font-medium text-muted-foreground w-16">#</th>
            <th className="text-left p-4 font-medium text-muted-foreground">English</th>
            <th className="text-left p-4 font-medium text-muted-foreground">Polish</th>
            <th className="text-left p-4 font-medium text-muted-foreground w-24">Audio</th>
            <th className="text-left p-4 font-medium text-muted-foreground w-32">Actions</th>
          </tr>
        </thead>
        <tbody>
          {phrases.map((phrase, index) => (
            <PhraseRow
              key={phrase.id}
              phrase={phrase}
              index={index}
              isFirst={index === 0}
              isLast={index === phrases.length - 1}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Phrase Row Component
interface PhraseRowProps {
  phrase: PhraseDTO;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onDelete: (phraseId: string) => void;
  onMove: (phraseId: string, direction: "up" | "down") => void;
}

function PhraseRow({ phrase, index, isFirst, isLast, onDelete, onMove }: PhraseRowProps) {
  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="p-4 text-sm text-muted-foreground">
        {phrase.position}
      </td>
      <td className="p-4">
        <div className="text-sm text-foreground">{phrase.en_text}</div>
      </td>
      <td className="p-4">
        <div className="text-sm text-foreground">{phrase.pl_text}</div>
      </td>
      <td className="p-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled className="p-1 h-auto opacity-50">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m6-10V4a2 2 0 00-2-2H5a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V4z" />
            </svg>
          </Button>
        </div>
      </td>
      <td className="p-4">
        <div className="flex items-center gap-1">
          {/* Move up */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(phrase.id, "up")}
            disabled={true}
            className="p-1 h-auto opacity-50"
            title="Temporarily disabled"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
            </svg>
          </Button>
          
          {/* Move down */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(phrase.id, "down")}
            disabled={true}
            className="p-1 h-auto opacity-50"
            title="Temporarily disabled"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
          
          {/* Delete */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(phrase.id)}
            className="p-1 h-auto text-destructive hover:text-destructive"
            title="Delete phrase"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </td>
    </tr>
  );
}

// Main export with ToastProvider wrapper
export default function NotebookView(props: NotebookViewProps) {
  return (
    <ToastProvider>
      <NotebookViewContent {...props} />
    </ToastProvider>
  );
}
