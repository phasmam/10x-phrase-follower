import React from "react";

interface NotebookViewProps {
  notebookId: string;
}

/**
 * Placeholder for NotebookView component
 * TODO: Implement full notebook view with phrase table, reorder, and actions
 */
export default function NotebookView({ notebookId }: NotebookViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Notebook Details</h1>
        <a 
          href="/notebooks" 
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Notebooks
        </a>
      </div>
      
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Phrases</h2>
        <p className="text-muted-foreground">
          Notebook view with phrase table will be implemented in the next step.
        </p>
        <div className="mt-4 p-4 bg-muted/50 rounded-md">
          <p className="text-sm text-muted-foreground">
            Notebook ID: <code>{notebookId}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
