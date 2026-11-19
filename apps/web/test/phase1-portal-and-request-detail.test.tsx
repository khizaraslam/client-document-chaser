import {
  EmailStatus,
  FileScanStatus,
  OrganizationCountry,
  PlanCode,
  RequestItemStatus,
  RequestStatus,
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
  id: 'req-1',
  token: 'portal-token-abc1234567890',
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

describe('Phase 1 Portal & Request Detail UI', () => {
  it('renders ClientPortalPage checklist and handles invalid/revoked token error cleanly', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            firmName: 'Vance Chartered Accountants',
            clientName: 'Oakridge Holdings Ltd',
            recipientEmail: 'james@oakridge.test',
            requestId: 'req-1',
            title: 'Q4 VAT & Bank Statements',
            instructions: 'Upload PDF statements before Friday.',
            status: RequestStatus.SENT,
            dueAt: '2026-12-31T23:59:59.000Z',
            expiresAt: '2026-12-20T23:59:59.000Z',
            maxFileSizeBytes: 25 * 1024 * 1024,
            allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'docx'],
            items: [
              {
                id: 'item-1',
                title: 'Business Bank Statement',
                description: 'October–December statement',
                isRequired: true,
                status: RequestItemStatus.PENDING,
                sortOrder: 0,
                acceptedMimeTypes: ['application/pdf'],
                files: [],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message:
              'This portal link has been revoked. Please contact your accounting firm for a new link.',
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      );

    const { unmount } = renderWithProviders(<ClientPortalPage />);

    await waitFor(() => {
      expect(screen.getByText('Q4 VAT & Bank Statements')).toBeInTheDocument();
      expect(screen.getByText('Business Bank Statement')).toBeInTheDocument();
      expect(screen.getByText('0 / 1 submitted')).toBeInTheDocument();
    });

    unmount();

    renderWithProviders(<ClientPortalPage />);
    await waitFor(() => {
      expect(screen.getByText('Portal link unavailable')).toBeInTheDocument();
      expect(
        screen.getByText(/this portal link has been revoked/i),
      ).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });

  it('renders RequestDetailPage email status, portal controls, one-time link dialog, and submitted files', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) {
          return new Response(JSON.stringify(MOCK_ME), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/requests/req-1/portal-link') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              portalUrl: 'https://portal.test/portal/one-time-fresh-token',
              expiresAt: '2026-12-31T00:00:00.000Z',
              portalAccess: {
                id: 'pa-2',
                status: 'ACTIVE',
                recipientEmail: 'james@oakridge.test',
                expiresAt: '2026-12-31T00:00:00.000Z',
                revokedAt: null,
                lastAccessedAt: null,
                accessCount: 0,
                createdAt: new Date().toISOString(),
              },
              emailDelivery: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/requests/req-1')) {
          return new Response(
            JSON.stringify({
              id: 'req-1',
              clientId: 'c-1',
              clientName: 'Oakridge Holdings Ltd',
              templateId: null,
              recurrenceId: null,
              periodKey: null,
              title: 'Q4 VAT & Bank Statements',
              instructions: 'Please upload PDF files.',
              status: RequestStatus.IN_PROGRESS,
              isOverdue: false,
              dueAt: '2026-12-31T23:59:59.000Z',
              sentAt: '2026-11-10T10:00:00.000Z',
              completedAt: null,
              cancelledAt: null,
              totalItemsCount: 1,
              completedItemsCount: 0,
              createdAt: '2026-11-10T09:00:00.000Z',
              updatedAt: '2026-11-10T10:00:00.000Z',
              recipientEmail: 'james@oakridge.test',
              emailDelivery: {
                id: 'em-1',
                status: EmailStatus.SENT,
                recipientEmail: 'james@oakridge.test',
                templateName: 'document_request_sent',
                providerMessageId: 're_123456',
                errorMessage: null,
                createdAt: '2026-11-10T10:00:00.000Z',
                updatedAt: '2026-11-10T10:00:00.000Z',
              },
              portalAccess: {
                id: 'pa-1',
                status: 'ACTIVE',
                recipientEmail: 'james@oakridge.test',
                expiresAt: '2026-12-01T10:00:00.000Z',
                revokedAt: null,
                lastAccessedAt: null,
                accessCount: 2,
                createdAt: '2026-11-10T10:00:00.000Z',
              },
              items: [
                {
                  id: 'item-1',
                  requestId: 'req-1',
                  title: 'Business Bank Statement',
                  description: null,
                  isRequired: true,
                  status: RequestItemStatus.UPLOADED,
                  sortOrder: 0,
                  acceptedMimeTypes: ['application/pdf'],
                  createdAt: '2026-11-10T09:00:00.000Z',
                  updatedAt: '2026-11-10T11:00:00.000Z',
                },
              ],
              files: [
                {
                  id: 'file-1',
                  requestId: 'req-1',
                  requestItemId: 'item-1',
                  requestItemTitle: 'Business Bank Statement',
                  originalFilename: 'q4-bank.pdf',
                  sanitizedFilename: 'q4-bank.pdf',
                  mimeType: 'application/pdf',
                  detectedMimeType: 'application/pdf',
                  sizeBytes: 20480,
                  scanStatus: FileScanStatus.CLEAN,
                  scanDetails: null,
                  uploadedAt: '2026-11-10T11:00:00.000Z',
                  createdAt: '2026-11-10T11:00:00.000Z',
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

    renderWithProviders(<RequestDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('james@oakridge.test')).toBeInTheDocument();
      expect(
        screen.getByText('Accepted by Resend (pending delivery)'),
      ).toBeInTheDocument();
      expect(screen.getByText('q4-bank.pdf')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /download/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /issue fresh link/i }));

    await waitFor(() => {
      expect(
        screen.getByText('One-time portal link generated'),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('https://portal.test/portal/one-time-fresh-token'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/stores only the sha-256 hash/i),
      ).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });
});
