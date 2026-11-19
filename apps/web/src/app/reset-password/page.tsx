'use client';

import { ResetPasswordInput, ResetPasswordSchema } from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest, ApiClientError } from '@/lib/api-client';

function ResetPasswordFormContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [done, setDone] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token, newPassword: '' },
  });

  React.useEffect(() => {
    setValue('token', token);
  }, [token, setValue]);

  const onSubmit = async (values: ResetPasswordInput) => {
    setServerError(null);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setDone(true);
    } catch (err) {
      setServerError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to reset password.',
      );
    }
  };

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-[#99F6E4] bg-[#F0FDFA] p-4 text-sm text-[#0F766E]">
          Your password has been updated and prior sessions were revoked.
        </div>
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0F766E] text-sm font-medium text-white hover:bg-[#0D9488]"
        >
          Sign in with new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {!token && (
        <div
          role="alert"
          className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-sm text-[#991B1B]"
        >
          Password reset token is missing from the link. Request a new password reset email.
        </div>
      )}

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-sm text-[#991B1B]"
        >
          {serverError}
        </div>
      )}

      <input type="hidden" {...register('token')} />

      <div>
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
        />
        <p className="mt-1 text-xs text-[#64748B]">
          Minimum 10 characters with uppercase, lowercase, and a number.
        </p>
        {errors.newPassword && (
          <p className="mt-1 text-xs text-[#DC2626]">
            {errors.newPassword.message}
          </p>
        )}
        {errors.token && (
          <p className="mt-1 text-xs text-[#DC2626]">{errors.token.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
        {isSubmitting ? 'Updating password...' : 'Update password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Enter a strong password to regain access to your workspace."
      footer={
        <Link href="/login" className="font-medium text-[#0F766E] hover:underline">
          Back to sign in
        </Link>
      }
    >
      <React.Suspense
        fallback={<p className="text-sm text-[#475569]">Loading reset form...</p>}
      >
        <ResetPasswordFormContent />
      </React.Suspense>
    </AuthShell>
  );
}
