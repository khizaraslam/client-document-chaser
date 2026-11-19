'use client';

import { LoginInput, LoginSchema } from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest, ApiClientError } from '@/lib/api-client';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/app');
        router.refresh();
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Unable to sign in right now. Please try again.');
      }
    }
  };

  return (
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
        <Label htmlFor="login-email">Work email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="claire@vanceaccounting.co.uk"
          {...register('email')}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-[#DC2626]">{errors.email.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor="login-password" className="mb-0">
            Password
          </Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-[#0F766E] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-1 text-xs text-[#DC2626]">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  );
}
