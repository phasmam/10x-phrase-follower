import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Button } from "./button";

// Toast types
export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

// Toast context
interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Toast provider component
/* eslint-disable react-compiler/react-compiler */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000, // Default 5 seconds
    };

    setToasts((prev) => [...prev, newToast]);

    // Auto-remove toast after duration
    if (newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

// Hook to use toast context
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Toast container component
function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

// Individual toast item component
function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToast();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => removeToast(toast.id), 150); // Wait for animation
  };

  const getToastStyles = () => {
    const baseStyles = "p-4 rounded-lg border shadow-lg transition-all duration-150 transform";
    const visibilityStyles = isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0";

    switch (toast.type) {
      case "success":
        return `${baseStyles} ${visibilityStyles} bg-green-50 border-green-200 text-green-800`;
      case "error":
        return `${baseStyles} ${visibilityStyles} bg-red-50 border-red-200 text-red-800`;
      case "warning":
        return `${baseStyles} ${visibilityStyles} bg-yellow-50 border-yellow-200 text-yellow-800`;
      case "info":
        return `${baseStyles} ${visibilityStyles} bg-blue-50 border-blue-200 text-blue-800`;
      default:
        return `${baseStyles} ${visibilityStyles} bg-card border-border text-foreground`;
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "warning":
        return "⚠";
      case "info":
        return "ℹ";
      default:
        return "";
    }
  };

  return (
    <div className={getToastStyles()}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-2">
          {getIcon() && (
            <span className="text-lg font-bold mt-0.5" aria-hidden="true">
              {getIcon()}
            </span>
          )}
          <div className="flex-1">
            <div className="font-medium">{toast.title}</div>
            {toast.description && <div className="text-sm opacity-90 mt-1">{toast.description}</div>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 ml-2 opacity-70 hover:opacity-100"
          onClick={handleClose}
        >
          <span className="sr-only">Close</span>✕
        </Button>
      </div>
    </div>
  );
}

// Convenience functions for common toast types
export const toast = {
  success: (title: string, description?: string, duration?: number) => {
    // This will be used with the hook
    return { type: "success" as const, title, description, duration };
  },
  error: (title: string, description?: string, duration?: number) => {
    return { type: "error" as const, title, description, duration };
  },
  warning: (title: string, description?: string, duration?: number) => {
    return { type: "warning" as const, title, description, duration };
  },
  info: (title: string, description?: string, duration?: number) => {
    return { type: "info" as const, title, description, duration };
  },
};
