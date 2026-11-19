'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  notify: (toast: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = React.useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border bg-white p-4 shadow-md',
              t.variant === 'error'
                ? 'border-[#FECACA]'
                : 'border-[#E2E0D8]',
            )}
          >
            {t.variant === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626]" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0F766E]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#0F172A]">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs text-[#475569]">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-[#64748B] hover:bg-[#F3F1EC] hover:text-[#0F172A]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
