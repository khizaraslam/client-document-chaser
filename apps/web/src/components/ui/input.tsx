import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-[#D6D3C9] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-[#F3F1EC] disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
