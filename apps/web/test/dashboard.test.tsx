import {
  AuditActorType,
  OrganizationCountry,
  PlanCode,
  RequestStatus,
  SubscriptionStatus,
  UserRole,
} from '@cdc/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceOverviewPage from '@/app/app/page';
import { ToastProvider } from '@/components/ui/toast';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Phase 3 Dashboard Overview UI', () => {
  it('renders backend dashboard summary metrics, usage meters, attention requests, and audit events', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) {
          return new Response(
            JSON.stringify({
              user: {
                id: 'u-1',
                email: 'owner@firm.test',
                fullName: 'Claire Vance',
                emailVerified: true,
                lastLoginAt: null,
              },
              membership: { id: 'm-1', role: UserRole.OWNER },
              organization: {
                id: 'org-1',
                name: 'Vance Chartered Accountants',
                slug: 'vance',
                country: OrganizationCountry.UK,
                timezone: 'Europe/London',
              },
              subscription: {
                planCode: PlanCode.STARTER,
                planName: 'Starter',
                status: SubscriptionStatus.TRIALING,
                trialStartsAt: new Date().toISOString(),
                trialEndsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
                isReadOnly: false,
                maxActiveClients: 50,
                maxTeamSeats: 5,
                maxStorageBytes: 1024 * 1024 * 100,
                maxEmailsPerMonth: 2500,
                activeClientsCount: 4,
                storageBytesUsed: 1024 * 1024 * 25,
                emailsSentThisPeriod: 120,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url.includes('/dashboard/summary')) {
          return new Response(
            JSON.stringify({
              metrics: {
                activeClientsCount: 4,
                totalRequestsCount: 9,
                draftRequestsCount: 1,
                sentRequestsCount: 3,
                inProgressRequestsCount: 2,
                completedRequestsCount: 3,
                cancelledRequestsCount: 0,
                overdueRequestsCount: 1,
                openRequestsCount: 6,
                awaitingReviewItemsCount: 3,
                rejectedItemsCount: 0,
                activeRecurrencesCount: 2,
                failedEmailsCount: 1,
              },
              usage: {
                storageBytesUsed: 25 * 1024 * 1024,
                maxStorageBytes: 100 * 1024 * 1024,
                storagePercentUsed: 25,
                emailsSentThisPeriod: 120,
                maxEmailsPerMonth: 2500,
                emailPercentUsed: 5,
                activeClientsCount: 4,
                maxActiveClients: 50,
              },
              trial: {
                status: SubscriptionStatus.TRIALING,
                planCode: PlanCode.STARTER,
                planName: 'Starter',
                trialStartsAt: new Date().toISOString(),
                trialEndsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
                daysRemaining: 10,
                isReadOnly: false,
              },
              attentionRequests: [
                {
                  id: 'req-attn-1',
                  title: 'Q3 VAT Verification',
                  clientId: 'cli-1',
                  clientName: 'Oakridge Holdings Ltd',
                  status: RequestStatus.SENT,
                  dueAt: '2026-11-10T00:00:00.000Z',
                  isOverdue: true,
                  completedItemsCount: 1,
                  totalItemsCount: 3,
                  awaitingReviewItemsCount: 2,
                  rejectedItemsCount: 0,
                },
              ],
              recentAuditEvents: [
                {
                  id: 'aud-1',
                  actorType: AuditActorType.USER,
                  actorUserId: 'u-1',
                  action: 'DOCUMENT_ITEM_ACCEPTED',
                  resourceType: 'request_item',
                  resourceId: 'item-1',
                  metadata: {},
                  ipAddress: '127.0.0.1',
                  createdAt: '2026-11-18T10:00:00.000Z',
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        return new Response(JSON.stringify([]), { status: 200 });
      });

    renderWithProviders(<WorkspaceOverviewPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Vance Chartered Accountants'),
      ).toBeInTheDocument();
      expect(screen.getByText('Q3 VAT Verification')).toBeInTheDocument();
      expect(screen.getByText(/1 overdue/i)).toBeInTheDocument();
      expect(screen.getByText(/3 awaiting review/i)).toBeInTheDocument();
      expect(screen.getByText(/1 failed email\(s\)/i)).toBeInTheDocument();
      expect(screen.getByText(/120 \/ 2500/i)).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });
});
