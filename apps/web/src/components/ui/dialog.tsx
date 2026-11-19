'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className={cn(
          'w-full max-w-md rounded-lg border border-[#E2E0D8] bg-white shadow-lg',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E2E0D8] px-6 py-4">
          <div>
            <h2
              id="dialog-title"
              className="text-base font-semibold text-[#0F172A]"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-[#475569]">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1.5 text-[#64748B] hover:bg-[#F3F1EC] hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
