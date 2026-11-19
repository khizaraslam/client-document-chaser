'use client';

import { AcceptInviteInput, AcceptInviteSchema } from '@cdc/contracts';
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

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [acceptedInfo, setAcceptedInfo] = React.useState<{
    organizationName: string;
    role: string;
  } | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteInput>({
    resolver: zodResolver(AcceptInviteSchema),
    defaultValues: { token, fullName: '', password: '' },
  });

  React.useEffect(() => {
    setValue('token', token);
  }, [token, setValue]);

  const onSubmit = async (values: AcceptInviteInput) => {
    setServerError(null);
    try {
      const res = await apiRequest<{
        accepted: boolean;
        organizationName: string;
        role: string;
      }>('/memberships/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          token: values.token,
          fullName: values.fullName || undefined,
          password: values.password || undefined,
        }),
      });
      setAcceptedInfo({
        organizationName: res.organizationName,
        role: res.role,
      });
    } catch (err) {
      setServerError(
        err instanceof ApiClientError
          ? err.message
          : 'Unable to accept invitation.',
      );
    }
  };

  if (acceptedInfo) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-[#99F6E4] bg-[#F0FDFA] p-4 text-sm text-[#0F766E]">
          Joined <strong>{acceptedInfo.organizationName}</strong> as{' '}
          <strong>{acceptedInfo.role}</strong>.
        </div>
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0F766E] text-sm font-medium text-white hover:bg-[#0D9488]"
        >
          Sign in to workspace
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
          Invitation token is missing from the link. Request a new workspace invitation from your firm administrator.
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
        <Label htmlFor="invite-name">Full name</Label>
        <Input
          id="invite-name"
          placeholder="Marcus Reid"
          {...register('fullName')}
        />
        {errors.fullName && (
          <p className="mt-1 text-xs text-[#DC2626]">
            {errors.fullName.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="invite-password">Set account password</Label>
        <Input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        <p className="mt-1 text-xs text-[#64748B]">
          Leave blank only if you already have an account with this email.
        </p>
        {errors.password && (
          <p className="mt-1 text-xs text-[#DC2626]">
            {errors.password.message}
          </p>
        )}
        {errors.token && (
          <p className="mt-1 text-xs text-[#DC2626]">{errors.token.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
        {isSubmitting ? 'Accepting invitation...' : 'Accept team invitation'}
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <AuthShell
      title="Accept firm invitation"
      subtitle="Join your accounting team on Client Document Chaser."
      footer={
        <Link href="/login" className="font-medium text-[#0F766E] hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <React.Suspense
        fallback={<p className="text-sm text-[#475569]">Loading invitation...</p>}
      >
        <AcceptInviteContent />
      </React.Suspense>
    </AuthShell>
  );
}
