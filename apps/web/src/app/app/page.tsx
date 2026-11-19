'use client';

import {
  AuthMeResponse,
  DashboardSummaryResponse,
  UserRole,
} from '@cdc/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import {
  formatAuditAction,
  formatFileSize,
  REQUEST_STATUS_LABELS,
  requestStatusClass,
} from '@/lib/phase2-labels';
import { formatShortDate } from '@/lib/utils';

export default function WorkspaceOverviewPage() {
  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
  });

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiRequest<DashboardSummaryResponse>('/dashboard/summary'),
    enabled: Boolean(meQuery.data),
  });

  const me = meQuery.data;
  if (!me) return null;

  const canViewAudit =
    me.membership.role === UserRole.OWNER ||
    me.membership.role === UserRole.ADMIN;
  const summary = dashboardQuery.data;

  const metrics = summary?.metrics;
  const usage = summary?.usage;
  const trial = summary?.trial;
  const attentionRequests = summary?.attentionRequests ?? [];
  const recentAuditEvents = summary?.recentAuditEvents ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">
            {me.organization.name}
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Signed in as {me.user.fullName} ({me.membership.role}) ·{' '}
            {me.organization.country} · {me.organization.timezone}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/app/clients"
            className="inline-flex h-9 items-center rounded-md border border-[#D6D3C9] bg-white px-3.5 text-xs font-medium text-[#0F172A] hover:bg-[#F3F1EC] whitespace-nowrap"
          >
            Manage clients
          </Link>
          <Link
            href="/app/requests"
            className="inline-flex h-9 items-center rounded-md bg-[#0F766E] px-3.5 text-xs font-medium text-white hover:bg-[#0D9488] whitespace-nowrap"
          >
            Document requests
          </Link>
        </div>
      </div>

      {dashboardQuery.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          <span>
            {dashboardQuery.error instanceof ApiClientError
              ? dashboardQuery.error.message
              : 'Unable to load workspace dashboard metrics.'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => dashboardQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-xs font-medium text-[#64748B]">
              Trial &amp; Plan Status
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
              {trial?.planName ?? me.subscription.planName}
            </p>
            <p className="mt-1 text-xs text-[#475569] tabular-nums">
              {trial ? `${trial.status} · ${trial.daysRemaining}d remaining` : me.subscription.status}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-xs font-medium text-[#64748B]">
              Active Clients Quota
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
              {metrics
                ? metrics.activeClientsCount
                : me.subscription.activeClientsCount}{' '}
              / {usage?.maxActiveClients ?? me.subscription.maxActiveClients}
            </p>
            <p className="mt-1 text-xs text-[#475569] tabular-nums">
              {me.subscription.maxTeamSeats} max team seats
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-xs font-medium text-[#64748B]">
              Open Document Requests
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
              {dashboardQuery.isLoading || !metrics
                ? '—'
                : metrics.openRequestsCount}
            </p>
            <p className="mt-1 text-xs text-[#475569] tabular-nums">
              {metrics && metrics.overdueRequestsCount > 0 ? (
                <span className="font-medium text-[#DC2626]">
                  {metrics.overdueRequestsCount} overdue
                </span>
              ) : (
                'All open requests on schedule'
              )}
              {metrics && metrics.awaitingReviewItemsCount > 0
                ? ` · ${metrics.awaitingReviewItemsCount} awaiting review`
                : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-xs font-medium text-[#64748B]">
              Schedules &amp; Delivery
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-[#0F172A] tabular-nums">
              {dashboardQuery.isLoading || !metrics
                ? '—'
                : metrics.activeRecurrencesCount}
            </p>
            <p className="mt-1 text-xs text-[#475569] tabular-nums">
              {metrics && metrics.failedEmailsCount > 0 ? (
                <span className="font-medium text-[#DC2626]">
                  {metrics.failedEmailsCount} failed email(s)
                </span>
              ) : (
                'Active recurring schedules'
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {usage && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#64748B]">
                  Private Storage Usage
                </span>
                <span className="font-mono-tabular text-[#0F172A]">
                  {formatFileSize(usage.storageBytesUsed)} /{' '}
                  {formatFileSize(usage.maxStorageBytes)} (
                  {usage.storagePercentUsed}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#F3F1EC]">
                <div
                  className="h-full rounded-full bg-[#0F766E] transition-all"
                  style={{ width: `${usage.storagePercentUsed}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#64748B]">
                  Monthly Outreach Emails
                </span>
                <span className="font-mono-tabular text-[#0F172A]">
                  {usage.emailsSentThisPeriod} / {usage.maxEmailsPerMonth} (
                  {usage.emailPercentUsed}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#F3F1EC]">
                <div
                  className="h-full rounded-full bg-[#0F766E] transition-all"
                  style={{ width: `${usage.emailPercentUsed}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Requests Needing Attention</CardTitle>
            <Link
              href="/app/requests"
              className="text-xs font-medium text-[#0F766E] hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {dashboardQuery.isLoading ? (
              <div className="space-y-3">
                <div className="h-10 rounded bg-[#F3F1EC] animate-pulse" />
                <div className="h-10 rounded bg-[#F3F1EC] animate-pulse" />
              </div>
            ) : attentionRequests.length > 0 ? (
              attentionRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-3 border-b border-[#E2E0D8] pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/app/requests/${req.id}`}
                      className="block font-medium text-[#0F172A] hover:text-[#0F766E] truncate"
                    >
                      {req.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-[#64748B] truncate">
                      {req.clientName} · {req.completedItemsCount}/
                      {req.totalItemsCount} accepted
                      {req.awaitingReviewItemsCount > 0
                        ? ` · ${req.awaitingReviewItemsCount} to review`
                        : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={requestStatusClass(req.status)}>
                      {req.isOverdue
                        ? 'Overdue'
                        : REQUEST_STATUS_LABELS[req.status]}
                    </span>
                    <p className="mt-1 text-[11px] text-[#64748B] tabular-nums">
                      Due {formatShortDate(req.dueAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#475569]">
                All client document requests are up to date.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Recent Organization Audit Events</CardTitle>
          </CardHeader>
          <CardContent>
            {!canViewAudit ? (
              <p className="text-sm text-[#475569]">
                Audit logs are restricted to firm Owners and Admins.
              </p>
            ) : dashboardQuery.isLoading ? (
              <div className="space-y-3">
                <div className="h-8 rounded bg-[#F3F1EC] animate-pulse" />
                <div className="h-8 rounded bg-[#F3F1EC] animate-pulse" />
              </div>
            ) : recentAuditEvents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E2E0D8] text-xs font-medium text-[#64748B]">
                      <th className="py-2 pr-4">Event</th>
                      <th className="py-2 pr-4">Resource</th>
                      <th className="py-2 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAuditEvents.map((event) => (
                      <tr
                        key={event.id}
                        className="border-b border-[#F3F1EC] last:border-0"
                      >
                        <td className="py-2.5 pr-4 font-mono-tabular text-xs text-[#0F172A]">
                          {formatAuditAction(event.action)}
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-[#475569]">
                          {event.resourceType}
                        </td>
                        <td className="py-2.5 text-right text-xs text-[#64748B] tabular-nums whitespace-nowrap">
                          {formatShortDate(event.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[#475569]">
                No audit events recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
