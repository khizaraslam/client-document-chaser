'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { apiRequest, ApiClientError } from '@/lib/api-client';

const verificationRequests = new Map<string, Promise<{ verified: boolean }>>();

function verifyTokenOnce(token: string): Promise<{ verified: boolean }> {
  const existing = verificationRequests.get(token);
  if (existing) return existing;

  const request = apiRequest<{ verified: boolean }>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  verificationRequests.set(token, request);
  return request;
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = React.useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );
  const [message, setMessage] = React.useState<string>(
    token
      ? 'Verifying your email address...'
      : 'Verification token is missing from the link.',
  );

  React.useEffect(() => {
    if (!token) return;
    let active = true;

    verifyTokenOnce(token)
      .then(() => {
        if (!active) return;
        setStatus('success');
        setMessage('Your email address has been verified.');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStatus('error');
        setMessage(
          err instanceof ApiClientError
            ? err.message
            : 'Unable to verify email link.',
        );
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="space-y-4 text-sm">
      <div
        className={`rounded-md border px-4 py-3 ${
          status === 'error'
            ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
            : status === 'success'
              ? 'border-[#99F6E4] bg-[#F0FDFA] text-[#0F766E]'
              : 'border-[#E2E0D8] bg-[#FAF9F6] text-[#334155]'
        }`}
      >
        {message}
      </div>
      <div className="pt-2">
        <Link
          href="/app"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0F766E] text-sm font-medium text-white hover:bg-[#0D9488]"
        >
          Continue to workspace
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Email verification"
      subtitle="Confirming your firm account address."
    >
      <React.Suspense
        fallback={
          <p className="text-sm text-[#475569]">Verifying your email...</p>
        }
      >
        <VerifyEmailContent />
      </React.Suspense>
    </AuthShell>
  );
}
