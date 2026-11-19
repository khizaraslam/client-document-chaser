import {
  EmailStatus,
  FileScanStatus,
  OrganizationCountry,
  PlanCode,
  RequestItemStatus,
  RequestStatus,
  ReviewDecision,
  SubscriptionStatus,
  UserRole,
} from '@cdc/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import RequestDetailPage from '@/app/app/requests/[id]/page';
import ClientPortalPage from '@/app/portal/[token]/page';
import { ToastProvider } from '@/components/ui/toast';

const mockParams: { id?: string; token?: string } = {
  id: 'req-rev-1',
  token: 'portal-token-rev-123456',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => mockParams,
}));

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

const MOCK_ME = {
  user: {
    id: 'u-1',
    email: 'claire@vanceaccounting.co.uk',
    fullName: 'Claire Vance',
    emailVerified: true,
    lastLoginAt: null,
  },
  membership: { id: 'm-1', role: UserRole.OWNER },
  organization: {
    id: 'org-1',
    name: 'Vance Chartered Accountants',
    slug: 'vance-chartered',
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
    maxActiveClients: 25,
    maxTeamSeats: 5,
    maxStorageBytes: 1024 * 1024 * 1024,
    maxEmailsPerMonth: 1000,
    activeClientsCount: 1,
    storageBytesUsed: 0,
    emailsSentThisPeriod: 0,
  },
};

describe('Phase 2 Document Review UI', () => {
  it('renders Accept/Reject review controls, rejection dialog, and review history on RequestDetailPage', async () => {
    let submittedRejectPayload: unknown = null;

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (url.includes('/auth/me')) {
          return new Response(JSON.stringify(MOCK_ME), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/requests/req-rev-1/items/item-1/review') && method === 'POST') {
          submittedRejectPayload = JSON.parse(String(init?.body ?? '{}'));
          return new Response(
            JSON.stringify({
              review: {
                id: 'rev-new',
                organizationId: 'org-1',
                requestId: 'req-rev-1',
                requestItemId: 'item-1',
                uploadedFileId: 'file-1',
                reviewerUserId: 'u-1',
                reviewerName: 'Claire Vance',
                decision: ReviewDecision.REJECTED,
                notes: 'Missing page 3',
                createdAt: new Date().toISOString(),
              },
              itemStatus: RequestItemStatus.REJECTED,
              requestStatus: RequestStatus.IN_PROGRESS,
              completedAt: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/requests/req-rev-1/activity')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/requests/req-rev-1')) {
          return new Response(
            JSON.stringify({
              id: 'req-rev-1',
              clientId: 'cli-1',
              clientName: 'Oakridge Holdings Ltd',
              recipientEmail: 'james@oakridge.test',
              title: 'FY26 Audit Pack',
              instructions: 'Upload clean PDF files.',
              status: RequestStatus.IN_PROGRESS,
              dueAt: '2026-12-31T23:59:59.000Z',
              sentAt: '2026-11-01T10:00:00.000Z',
              completedAt: null,
              cancelledAt: null,
              createdAt: '2026-11-01T09:00:00.000Z',
              completedItemsCount: 0,
              totalItemsCount: 1,
              client: {
                id: 'cli-1',
                name: 'Oakridge Holdings Ltd',
                entityType: 'COMPANY',
                status: 'ACTIVE',
                primaryContactName: 'James',
                primaryContactEmail: 'james@oakridge.test',
              },
              emailDelivery: {
                id: 'em-1',
                status: EmailStatus.SENT,
                recipientEmail: 'james@oakridge.test',
                templateName: 'request_portal_link',
                providerMessageId: 're_123',
                errorMessage: null,
                sentAt: '2026-11-01T10:00:01.000Z',
                createdAt: '2026-11-01T10:00:01.000Z',
              },
              portalAccess: {
                status: 'ACTIVE',
                expiresAt: '2026-12-31T23:59:59.000Z',
                revokedAt: null,
                accessCount: 2,
                lastAccessedAt: '2026-11-01T10:30:00.000Z',
              },
              items: [
                {
                  id: 'item-1',
                  title: 'Audited Financials',
                  description: null,
                  isRequired: true,
                  status: RequestItemStatus.UPLOADED,
                  sortOrder: 0,
                  latestReview: null,
                },
              ],
              files: [
                {
                  id: 'file-1',
                  requestItemId: 'item-1',
                  requestItemTitle: 'Audited Financials',
                  originalFilename: 'financials.pdf',
                  mimeType: 'application/pdf',
                  sizeBytes: 20480,
                  scanStatus: FileScanStatus.CLEAN,
                  scanDetails: null,
                  uploadedAt: '2026-11-01T10:25:00.000Z',
                  createdAt: '2026-11-01T10:25:00.000Z',
                },
              ],
              reviews: [
                {
                  id: 'rev-prev',
                  organizationId: 'org-1',
                  requestId: 'req-rev-1',
                  requestItemId: 'item-1',
                  uploadedFileId: 'file-1',
                  reviewerUserId: 'u-1',
                  reviewerName: 'Claire Vance',
                  decision: ReviewDecision.ACCEPTED,
                  notes: 'Initial cover verified',
                  createdAt: '2026-11-01T11:00:00.000Z',
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

    renderWithProviders(<RequestDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('FY26 Audit Pack')).toBeInTheDocument();
      expect(screen.getByText('Document Review History (1)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() => {
      expect(
        screen.getByLabelText(/rejection reason/i),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/rejection reason/i), {
      target: { value: 'Missing page 3' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reject document/i }));

    await waitFor(() => {
      expect(submittedRejectPayload).toEqual({
        decision: ReviewDecision.REJECTED,
        notes: 'Missing page 3',
      });
    });

    fetchMock.mockRestore();
  });

  it('displays rejection reason and replacement upload prompt on ClientPortalPage', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          firmName: 'Vance Chartered Accountants',
          clientName: 'Oakridge Holdings Ltd',
          recipientEmail: 'james@oakridge.test',
          requestId: 'req-rev-1',
          title: 'FY26 Audit Pack',
          instructions: null,
          status: RequestStatus.IN_PROGRESS,
          dueAt: '2026-12-31T23:59:59.000Z',
          expiresAt: '2026-12-31T23:59:59.000Z',
          maxFileSizeBytes: 25 * 1024 * 1024,
          allowedExtensions: ['pdf'],
          items: [
            {
              id: 'item-1',
              title: 'Audited Financials',
              description: null,
              isRequired: true,
              status: RequestItemStatus.REJECTED,
              sortOrder: 0,
              acceptedMimeTypes: ['application/pdf'],
              latestReview: {
                decision: ReviewDecision.REJECTED,
                notes: 'Signature page missing.',
                reviewedAt: '2026-11-01T12:00:00.000Z',
              },
              files: [],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderWithProviders(<ClientPortalPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/replacement requested by vance chartered accountants/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/signature page missing\./i)).toBeInTheDocument();
      expect(
        screen.getByText(/upload replacement document/i),
      ).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });
});
