'use client';

import { ForgotPasswordInput, ForgotPasswordSchema } from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest, ApiClientError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [submittedMsg, setSubmittedMsg] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setServerError(null);
    try {
      const res = await apiRequest<{ message: string }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify(values),
        },
      );
      setSubmittedMsg(res.message);
    } catch (err) {
      setServerError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to process request right now.',
      );
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your work email and we will send reset instructions."
      footer={
        <Link href="/login" className="font-medium text-[#0F766E] hover:underline">
          Return to sign in
        </Link>
      }
    >
      {submittedMsg ? (
        <div className="rounded-md border border-[#99F6E4] bg-[#F0FDFA] p-4 text-sm text-[#0F766E]">
          {submittedMsg}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <div
              role="alert"
              className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-sm text-[#991B1B]"
            >
              {serverError}
            </div>
          )}

          <div>
            <Label htmlFor="forgot-email">Work email</Label>
            <Input
              id="forgot-email"
              type="email"
              placeholder="claire@vanceaccounting.co.uk"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {errors.email.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending instructions...' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
