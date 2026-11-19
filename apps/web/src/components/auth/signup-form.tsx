'use client';

import {
  COUNTRY_TIMEZONES,
  OrganizationCountry,
  RegisterFirmInput,
  RegisterFirmSchema,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiRequest, ApiClientError } from '@/lib/api-client';

interface SignupFormProps {
  onSuccess?: () => void;
}

export function SignupForm({ onSuccess }: SignupFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFirmInput>({
    resolver: zodResolver(RegisterFirmSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      firmName: '',
      country: OrganizationCountry.US,
      timezone: 'America/New_York',
    },
  });

  const selectedCountry = watch('country');

  React.useEffect(() => {
    const allowed = COUNTRY_TIMEZONES[selectedCountry];
    if (allowed && allowed.length > 0) {
      setValue('timezone', allowed[0]!);
    }
  }, [selectedCountry, setValue]);

  const onSubmit = async (values: RegisterFirmInput) => {
    setServerError(null);
    try {
      await apiRequest('/auth/register', {
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
        setServerError('Registration failed. Please check your details.');
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
        <Label htmlFor="signup-full-name">Full name</Label>
        <Input
          id="signup-full-name"
          placeholder="Claire Vance"
          autoComplete="name"
          {...register('fullName')}
        />
        {errors.fullName && (
          <p className="mt-1 text-xs text-[#DC2626]">
            {errors.fullName.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="signup-email">Work email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="claire@vanceaccounting.co.uk"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-[#DC2626]">{errors.email.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="signup-firm-name">Accounting / bookkeeping firm name</Label>
        <Input
          id="signup-firm-name"
          placeholder="Vance & Co Chartered Accountants"
          {...register('firmName')}
        />
        {errors.firmName && (
          <p className="mt-1 text-xs text-[#DC2626]">
            {errors.firmName.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="signup-country">Jurisdiction</Label>
          <Select id="signup-country" {...register('country')}>
            <option value={OrganizationCountry.US}>United States</option>
            <option value={OrganizationCountry.UK}>United Kingdom</option>
          </Select>
          {errors.country && (
            <p className="mt-1 text-xs text-[#DC2626]">
              {errors.country.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="signup-timezone">Firm timezone</Label>
          <Select id="signup-timezone" {...register('timezone')}>
            {COUNTRY_TIMEZONES[selectedCountry].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
          {errors.timezone && (
            <p className="mt-1 text-xs text-[#DC2626]">
              {errors.timezone.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        <p className="mt-1 text-xs text-[#64748B]">
          Minimum 10 characters with uppercase, lowercase, and a number.
        </p>
        {errors.password && (
          <p className="mt-1 text-xs text-[#DC2626]">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating firm workspace...' : 'Create firm & start trial'}
      </Button>
    </form>
  );
}
