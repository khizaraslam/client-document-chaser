'use client';

import {
  AuthMeResponse,
  COUNTRY_TIMEZONES,
  OrganizationCountry,
  SessionInfoItem,
  UpdateOrganizationInput,
  UpdateOrganizationSchema,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { formatShortDate } from '@/lib/utils';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { notify } = useToast();

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });

  const sessionsQuery = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiRequest<SessionInfoItem[]>('/auth/sessions'),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(UpdateOrganizationSchema),
  });

  const watchedCountry =
    watch('country') ?? meQuery.data?.organization.country ?? OrganizationCountry.US;
  const watchedTimezone = watch('timezone');

  React.useEffect(() => {
    if (meQuery.data) {
      reset({
        name: meQuery.data.organization.name,
        country: meQuery.data.organization.country,
        timezone: meQuery.data.organization.timezone,
      });
    }
  }, [meQuery.data, reset]);

  React.useEffect(() => {
    const allowed = COUNTRY_TIMEZONES[watchedCountry];
    if (allowed && allowed.length > 0 && watchedTimezone && !allowed.includes(watchedTimezone)) {
      setValue('timezone', allowed[0]!);
    }
  }, [watchedCountry, watchedTimezone, setValue]);

  const updateOrgMutation = useMutation({
    mutationFn: (values: UpdateOrganizationInput) =>
      apiRequest('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      notify({ variant: 'success', title: 'Organization settings saved' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not update settings',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      notify({ variant: 'success', title: 'Session revoked' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not revoke session',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => apiRequest('/auth/logout-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not sign out all devices',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const canEditOrg =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">
          Firm &amp; Security Settings
        </h1>
        <p className="mt-1 text-sm text-[#475569]">
          Configure firm profile, default jurisdiction timezone, and active
          authentication sessions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((vals) => updateOrgMutation.mutate(vals))}
            className="max-w-lg space-y-4"
          >
            <div>
              <Label htmlFor="org-name">Firm name</Label>
              <Input
                id="org-name"
                disabled={!canEditOrg}
                {...register('name')}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="org-country">Jurisdiction</Label>
                <Select
                  id="org-country"
                  disabled={!canEditOrg}
                  {...register('country')}
                >
                  <option value={OrganizationCountry.US}>United States</option>
                  <option value={OrganizationCountry.UK}>United Kingdom</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="org-timezone">Timezone</Label>
                <Select
                  id="org-timezone"
                  disabled={!canEditOrg}
                  {...register('timezone')}
                >
                  {COUNTRY_TIMEZONES[watchedCountry].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {canEditOrg ? (
              <Button type="submit" disabled={updateOrgMutation.isPending}>
                {updateOrgMutation.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            ) : (
              <p className="text-xs text-[#64748B]">
                Only firm Owners and Admins can modify organization settings.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle>Active Login Sessions</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => logoutAllMutation.mutate()}
            disabled={logoutAllMutation.isPending}
          >
            Sign out all devices
          </Button>
        </CardHeader>
        <CardContent>
          {sessionsQuery.isLoading ? (
            <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
          ) : sessionsQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              <span>
                {sessionsQuery.error instanceof ApiClientError
                  ? sessionsQuery.error.message
                  : 'Unable to load active login sessions.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => sessionsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                    <th className="py-2 pr-4">Client / Agent</th>
                    <th className="py-2 pr-4">IP Address</th>
                    <th className="py-2 pr-4">Expires</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsQuery.data.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[#F3F1EC] last:border-0"
                    >
                      <td className="py-2.5 pr-4 text-xs text-[#0F172A]">
                        <span className="block max-w-xs truncate">
                          {s.userAgent || 'Browser session'}
                        </span>
                        {s.isCurrent && (
                          <span className="text-[#0F766E] font-medium">
                            Current session
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 font-mono-tabular text-xs text-[#475569]">
                        {s.ipAddress || 'Unknown'}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-[#64748B] tabular-nums">
                        {formatShortDate(s.expiresAt)}
                      </td>
                      <td className="py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeSessionMutation.mutate(s.id)}
                          disabled={revokeSessionMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[#475569]">No active sessions found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
