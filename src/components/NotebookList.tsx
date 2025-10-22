import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { useApi } from "../lib/hooks/useApi";
import type { NotebookDTO, NotebookListResponse } from "../types";

interface NotebookListProps {
  initialItems?: NotebookDTO[];
}

export default function NotebookList({ initialItems = [] }: NotebookListProps) {
  const { apiCall, isAuthenticated } = useApi();
  const [notebooks, setNotebooks] = useState<NotebookDTO[]>(initialItems);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Fetch notebooks from API
  const fetchNotebooks = async (cursor?: string, query?: string) => {
    if (!isAuthenticated) {
      setError("Authentication required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (cursor) params.append("cursor", cursor);
      if (query) params.append("q", query);
      params.append("limit", "20");

      const data = await apiCall<NotebookListResponse>(
        `/api/notebooks?${params.toString()}`,
        { method: "GET" }
      );
      
      if (cursor) {
        // Append to existing notebooks (load more)
        setNotebooks(prev => [...prev, ...data.items]);
      } else {
        // Replace notebooks (new search or initial load)
        setNotebooks(data.items);
      }
      
      setNextCursor(data.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notebooks");
    } finally {
      setIsLoading(false);
    }
  };

  // Load notebooks on mount
  useEffect(() => {
    if (initialItems.length === 0) {
      fetchNotebooks();
    }
  }, []);

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNotebooks(undefined, searchQuery);
  };

  // Handle load more
  const handleLoadMore = () => {
    if (nextCursor) {
      fetchNotebooks(nextCursor, searchQuery);
    }
  };

  // Handle notebook actions
  const handleRename = async (id: string, newName: string) => {
    if (!isAuthenticated) {
      setError("Authentication required");
      return;
    }

    try {
      await apiCall(`/api/notebooks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
      });

      // Update local state
      setNotebooks(prev => 
        prev.map(notebook => 
          notebook.id === id 
            ? { ...notebook, name: newName, updated_at: new Date().toISOString() }
            : notebook
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename notebook");
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAuthenticated) {
      setError("Authentication required");
      return;
    }

    try {
      await apiCall(`/api/notebooks/${id}`, {
        method: "DELETE",
      });

      // Remove from local state
      setNotebooks(prev => prev.filter(notebook => notebook.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete notebook");
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notebooks..."
          className="flex-1 px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Notebooks grid */}
      {notebooks.length === 0 && !isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No notebooks found.</p>
          <a 
            href="/import" 
            className="inline-flex items-center mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Create your first notebook
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notebooks.map((notebook) => (
            <NotebookTile
              key={notebook.id}
              notebook={notebook}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {nextCursor && (
        <div className="text-center">
          <Button
            onClick={handleLoadMore}
            disabled={isLoading}
            variant="outline"
          >
            {isLoading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && notebooks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading notebooks...</p>
        </div>
      )}
    </div>
  );
}

interface NotebookTileProps {
  notebook: NotebookDTO;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

function NotebookTile({ notebook, onRename, onDelete }: NotebookTileProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(notebook.name);

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName !== notebook.name) {
      onRename(notebook.id, newName.trim());
    }
    setIsRenaming(false);
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${notebook.name}"?`)) {
      onDelete(notebook.id);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        {isRenaming ? (
          <form onSubmit={handleRename} className="flex-1 mr-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-input rounded bg-background"
              autoFocus
              onBlur={() => setIsRenaming(false)}
            />
          </form>
        ) : (
          <a
            href={`/notebooks/${notebook.id}`}
            className="flex-1 text-lg font-semibold text-foreground hover:text-primary transition-colors"
          >
            {notebook.name}
          </a>
        )}
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsRenaming(true)}
            className="p-1 h-auto"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="p-1 h-auto text-destructive hover:text-destructive"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Updated {new Date(notebook.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
