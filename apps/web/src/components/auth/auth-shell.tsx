import Link from 'next/link';
import * as React from 'react';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight text-[#0F172A]"
          >
            Client Document Chaser
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold text-[#0F172A]">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-[#475569]">{subtitle}</p>
        </div>

        <div className="rounded-lg border border-[#E2E0D8] bg-white p-6 sm:p-8">
          {children}
        </div>

        {footer && (
          <div className="mt-6 text-center text-sm text-[#475569]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
