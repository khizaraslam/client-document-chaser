'use client';

import {
  AuthMeResponse,
  COUNTRY_TIMEZONES,
  ClientStatus,
  ClientSummary,
  CreateRecurrenceInput,
  CreateRecurrenceSchema,
  OrganizationCountry,
  RecurrenceFrequency,
  RecurrenceStatus,
  RecurrenceSummary,
  TemplateSummary,
  UserRole,
} from '@cdc/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pause, Play, Plus, Trash2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import {
  RECURRENCE_FREQUENCY_LABELS,
  recurrenceStatusClass,
} from '@/lib/phase2-labels';
import { formatShortDate } from '@/lib/utils';

type StatusFilter = 'ALL' | RecurrenceStatus;

function SchedulesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const initialClientId = searchParams.get('clientId') ?? '';
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ALL');
  const [clientFilter, setClientFilter] = React.useState(initialClientId);
  const [createOpen, setCreateOpen] = React.useState(false);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });
  const canDeleteSchedule =
    meQuery.data?.membership.role === UserRole.OWNER ||
    meQuery.data?.membership.role === UserRole.ADMIN;
  const isReadOnly = Boolean(meQuery.data?.subscription.isReadOnly);

  const clientsQuery = useQuery({
    queryKey: ['clients', 'active-for-schedules'],
    queryFn: () =>
      apiRequest<ClientSummary[]>(`/clients?status=${ClientStatus.ACTIVE}`),
  });

  const templatesQuery = useQuery({
    queryKey: ['templates', 'for-schedules'],
    queryFn: () => apiRequest<TemplateSummary[]>('/templates'),
    enabled: createOpen,
  });

  const recurrencesQuery = useQuery({
    queryKey: ['recurrences', statusFilter, clientFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (clientFilter) {
        params.set('clientId', clientFilter);
      }
      const qs = params.toString();
      return apiRequest<RecurrenceSummary[]>(
        `/recurrences${qs ? `?${qs}` : ''}`,
      );
    },
  });

  const allTimezones = React.useMemo(
    () => [
      ...COUNTRY_TIMEZONES[OrganizationCountry.US],
      ...COUNTRY_TIMEZONES[OrganizationCountry.UK],
    ],
    [],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateRecurrenceInput>({
    resolver: zodResolver(CreateRecurrenceSchema),
    defaultValues: {
      clientId: initialClientId || '',
      templateId: '',
      titleTemplate: 'Monthly Bookkeeping Close — {{period}}',
      instructions: '',
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 1,
      dueDaysAfterIssue: 10,
      timezone: meQuery.data?.organization.timezone ?? 'America/New_York',
    },
  });

  React.useEffect(() => {
    if (createOpen && meQuery.data) {
      reset({
        clientId: initialClientId || '',
        templateId: '',
        titleTemplate: 'Monthly Bookkeeping Close — {{period}}',
        instructions: '',
        frequency: RecurrenceFrequency.MONTHLY,
        dayOfMonth: 1,
        dueDaysAfterIssue: 10,
        timezone: meQuery.data.organization.timezone,
      });
    }
  }, [createOpen, initialClientId, meQuery.data, reset]);

  const createMutation = useMutation({
    mutationFn: (values: CreateRecurrenceInput) =>
      apiRequest('/recurrences', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      setCreateOpen(false);
      notify({ variant: 'success', title: 'Recurring schedule created' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not create schedule',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RecurrenceStatus }) =>
      apiRequest(`/recurrences/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      notify({
        variant: 'success',
        title:
          vars.status === RecurrenceStatus.PAUSED
            ? 'Schedule paused'
            : 'Schedule resumed',
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not update schedule',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ id: string; periodKey: string | null }>(
        `/recurrences/${id}/trigger`,
        { method: 'POST' },
      ),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      notify({
        variant: 'success',
        title: `Generated request for ${created.periodKey ?? 'current period'}`,
      });
      router.push(`/app/requests/${created.id}`);
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not generate request',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/recurrences/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] });
      notify({ variant: 'success', title: 'Recurring schedule deleted' });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not delete schedule',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">
            Recurring Schedules
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Automate monthly bookkeeping, quarterly VAT, and annual tax document requests.
          </p>
        </div>

        <Button
          type="button"
          disabled={isReadOnly}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          <span>New schedule</span>
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              className="inline-flex rounded-md bg-[#F3F1EC] p-1"
              role="tablist"
              aria-label="Filter schedules by status"
            >
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: RecurrenceStatus.ACTIVE, label: 'Active' },
                  { id: RecurrenceStatus.PAUSED, label: 'Paused' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={
                    statusFilter === tab.id
                      ? 'rounded bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] shadow-xs'
                      : 'rounded px-3 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Select
              aria-label="Filter schedules by client"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-full sm:w-56 h-10 text-xs"
            >
              <option value="">All clients</option>
              {(clientsQuery.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </div>

          {recurrencesQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
              <div className="h-12 rounded bg-[#F3F1EC] animate-pulse" />
            </div>
          ) : recurrencesQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
              <span>
                {recurrencesQuery.error instanceof ApiClientError
                  ? recurrencesQuery.error.message
                  : 'Unable to load recurring schedules.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => recurrencesQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : recurrencesQuery.data && recurrencesQuery.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                    <th className="py-2.5 pr-4">Schedule &amp; Template</th>
                    <th className="py-2.5 pr-4">Client</th>
                    <th className="py-2.5 pr-4">Cadence</th>
                    <th className="py-2.5 pr-4">Next Run</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recurrencesQuery.data.map((rec) => (
                    <tr
                      key={rec.id}
                      className="border-b border-[#F3F1EC] last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-[#0F172A]">
                          {rec.titleTemplate}
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          Template: {rec.templateName}
                          {rec.lastPeriodKey &&
                            ` · Last period: ${rec.lastPeriodKey}`}
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#475569]">
                        <Link
                          href={`/app/clients/${rec.clientId}`}
                          className="hover:text-[#0F172A] hover:underline"
                        >
                          {rec.clientName}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#475569] tabular-nums">
                        {RECURRENCE_FREQUENCY_LABELS[rec.frequency]} · Day{' '}
                        {rec.dayOfMonth} · Due +{rec.dueDaysAfterIssue}d
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#0F172A] tabular-nums whitespace-nowrap">
                        {formatShortDate(rec.nextRunAt)}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        <span className={recurrenceStatusClass(rec.status)}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isReadOnly || triggerMutation.isPending}
                            onClick={() => triggerMutation.mutate(rec.id)}
                            title="Generate request for current period immediately"
                          >
                            <Zap className="h-3.5 w-3.5 text-[#0F766E]" />
                            <span>Generate now</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={
                              isReadOnly || toggleStatusMutation.isPending
                            }
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                id: rec.id,
                                status:
                                  rec.status === RecurrenceStatus.ACTIVE
                                    ? RecurrenceStatus.PAUSED
                                    : RecurrenceStatus.ACTIVE,
                              })
                            }
                          >
                            {rec.status === RecurrenceStatus.ACTIVE ? (
                              <>
                                <Pause className="h-3.5 w-3.5" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5" />
                                <span>Resume</span>
                              </>
                            )}
                          </Button>
                          {canDeleteSchedule && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isReadOnly || deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(rec.id)}
                              className="text-[#DC2626] hover:bg-[#FEF2F2]"
                              aria-label="Delete schedule"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-[#94A3B8]" />
              <p className="mt-3 text-sm font-medium text-[#0F172A]">
                No recurring schedules yet
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                Pair an active client with a checklist template to generate periodic requests automatically.
              </p>
              {!isReadOnly && (
                <div className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    <span>New schedule</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New recurring schedule"
        description="Use {{period}} in the title template to insert YYYY-MM, YYYY-Qn, or YYYY automatically."
        className="max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={handleSubmit((vals) => createMutation.mutate(vals))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rec-client">Client</Label>
              <Select id="rec-client" {...register('clientId')}>
                <option value="">Select active client...</option>
                {(clientsQuery.data ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              {errors.clientId && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.clientId.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="rec-template">Checklist template</Label>
              <Select id="rec-template" {...register('templateId')}>
                <option value="">Select template...</option>
                {(templatesQuery.data ?? []).map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.itemsCount})
                  </option>
                ))}
              </Select>
              {errors.templateId && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.templateId.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="rec-title">Request title template</Label>
            <Input
              id="rec-title"
              placeholder="Monthly Bookkeeping Close — {{period}}"
              {...register('titleTemplate')}
            />
            {errors.titleTemplate && (
              <p className="mt-1 text-xs text-[#DC2626]">
                {errors.titleTemplate.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="rec-freq">Frequency</Label>
              <Select id="rec-freq" {...register('frequency')}>
                {Object.values(RecurrenceFrequency).map((freq) => (
                  <option key={freq} value={freq}>
                    {RECURRENCE_FREQUENCY_LABELS[freq]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="rec-day">Day of month (1-28)</Label>
              <Input
                id="rec-day"
                type="number"
                min={1}
                max={28}
                {...register('dayOfMonth')}
              />
              {errors.dayOfMonth && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.dayOfMonth.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="rec-due-days">Due after (days)</Label>
              <Input
                id="rec-due-days"
                type="number"
                min={1}
                max={90}
                {...register('dueDaysAfterIssue')}
              />
              {errors.dueDaysAfterIssue && (
                <p className="mt-1 text-xs text-[#DC2626]">
                  {errors.dueDaysAfterIssue.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="rec-tz">Schedule timezone</Label>
            <Select id="rec-tz" {...register('timezone')}>
              {allTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="rec-instructions">
              Default instructions (optional)
            </Label>
            <Textarea
              id="rec-instructions"
              rows={2}
              placeholder="Guidance included in each generated document request."
              {...register('instructions')}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create schedule'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

export default function SchedulesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-52 rounded bg-[#F3F1EC] animate-pulse" />
          <div className="h-64 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
        </div>
      }
    >
      <SchedulesContent />
    </React.Suspense>
  );
}
