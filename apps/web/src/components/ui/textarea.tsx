import * as React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[84px] w-full rounded-md border border-[#D6D3C9] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-[#F3F1EC] disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
