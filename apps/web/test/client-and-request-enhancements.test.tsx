import {
  AuditActorType,
  ClientEntityType,
  ClientStatus,
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
import ClientDetailPage from '@/app/app/clients/[id]/page';
import ClientsPage from '@/app/app/clients/page';
import RequestDetailPage from '@/app/app/requests/[id]/page';
import RequestsPage from '@/app/app/requests/page';
import { ToastProvider } from '@/components/ui/toast';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let currentId = 'c-1';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: currentId }),
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
    email: 'claire@vance.test',
    fullName: 'Claire Vance',
    emailVerified: true,
    lastLoginAt: null,
  },
  membership: { id: 'm-1', role: UserRole.OWNER },
  organization: {
    id: 'org-1',
    name: 'Vance Accountants',
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
    maxActiveClients: 25,
    maxTeamSeats: 5,
    maxStorageBytes: 1024 * 1024 * 1024,
    maxEmailsPerMonth: 1000,
    activeClientsCount: 2,
    storageBytesUsed: 0,
    emailsSentThisPeriod: 0,
  },
};

describe('Client & Document Request UI Enhancements', () => {
  it('renders ClientDetailPage contacts, files, activity, and confirms Archive & Contact Deactivate', async () => {
    currentId = 'c-1';
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
        if (url.includes('/memberships')) {
          return new Response(
            JSON.stringify({ members: [], pendingInvitations: [] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/clients/c-1/files')) {
          return new Response(
            JSON.stringify([
              {
                id: 'f-1',
                requestId: 'r-1',
                requestTitle: 'VAT Return Q4',
                requestStatus: RequestStatus.IN_PROGRESS,
                requestItemId: 'ri-1',
                requestItemTitle: 'Bank Statement PDF',
                originalFilename: 'q4-bank-export.pdf',
                sanitizedFilename: 'q4-bank-export.pdf',
                mimeType: 'application/pdf',
                detectedMimeType: 'application/pdf',
                sizeBytes: 15360,
                scanStatus: FileScanStatus.CLEAN,
                scanDetails: null,
                uploadedAt: '2026-10-12T10:00:00.000Z',
                createdAt: '2026-10-12T10:00:00.000Z',
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/clients/c-1/activity')) {
          return new Response(
            JSON.stringify([
              {
                id: 'aud-1',
                actorType: AuditActorType.USER,
                actorUserId: 'u-1',
                action: 'CLIENT_CREATED',
                resourceType: 'client',
                resourceId: 'c-1',
                metadata: {},
                ipAddress: null,
                createdAt: '2026-10-01T09:00:00.000Z',
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/clients/c-1/archive') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 'c-1',
              status: ClientStatus.ARCHIVED,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (
          url.includes('/clients/c-1/contacts/ct-1/deactivate') &&
          init?.method === 'POST'
        ) {
          return new Response(
            JSON.stringify({
              id: 'ct-1',
              isActive: false,
              isPrimary: false,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/clients/c-1')) {
          return new Response(
            JSON.stringify({
              id: 'c-1',
              name: 'Oakridge Holdings Ltd',
              companyName: 'Oakridge Trading Group',
              email: 'accounts@oakridge.test',
              phone: '+44 20 7946 0100',
              address: '12 Bishopsgate',
              referenceCode: 'OAK-001',
              entityType: ClientEntityType.LTD,
              country: OrganizationCountry.UK,
              status: ClientStatus.ACTIVE,
              assignedUserId: null,
              assignedUserName: null,
              primaryContactName: 'Claire Bennett',
              primaryContactEmail: 'claire@oakridge.test',
              primaryContactPhone: '+44 20 7946 0101',
              contactsCount: 1,
              openRequestsCount: 1,
              notes: 'Quarterly VAT client',
              contacts: [
                {
                  id: 'ct-1',
                  clientId: 'c-1',
                  fullName: 'Claire Bennett',
                  email: 'claire@oakridge.test',
                  phone: '+44 20 7946 0101',
                  roleTitle: 'Finance Director',
                  isPrimary: true,
                  isActive: true,
                  createdAt: '2026-10-01T09:00:00.000Z',
                  updatedAt: '2026-10-01T09:00:00.000Z',
                },
              ],
              createdAt: '2026-10-01T09:00:00.000Z',
              updatedAt: '2026-10-01T09:00:00.000Z',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/requests?clientId=c-1')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/recurrences?clientId=c-1')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

    renderWithProviders(<ClientDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Oakridge Holdings Ltd')).toBeInTheDocument();
      expect(screen.getByText('q4-bank-export.pdf')).toBeInTheDocument();
      expect(screen.getByText('Client created')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Oakridge Trading Group')).toBeInTheDocument();
    });

    // Archive requires confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: /archive client/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /confirm archive/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm archive/i }));

    await waitFor(() => {
      const archiveCall = fetchMock.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/clients/c-1/archive') && opts?.method === 'POST',
      );
      expect(archiveCall).toBeDefined();
    });

    // Deactivate contact requires confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /confirm deactivate/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm deactivate/i }));

    await waitFor(() => {
      const deactivateCall = fetchMock.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/clients/c-1/contacts/ct-1/deactivate') &&
          opts?.method === 'POST',
      );
      expect(deactivateCall).toBeDefined();
    });

    fetchMock.mockRestore();
  });

  it('supports Edit modal in ClientsPage', async () => {
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
        if (url.includes('/memberships')) {
          return new Response(
            JSON.stringify({ members: [], pendingInvitations: [] }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/clients/c-1') && init?.method === 'PATCH') {
          return new Response(JSON.stringify({ id: 'c-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/clients/c-1')) {
          return new Response(
            JSON.stringify({
              id: 'c-1',
              name: 'Oakridge Holdings Ltd',
              companyName: 'Oakridge Group',
              email: 'hello@oakridge.test',
              phone: '12345',
              address: 'London',
              referenceCode: 'OAK-1',
              entityType: ClientEntityType.LTD,
              country: OrganizationCountry.UK,
              status: ClientStatus.ACTIVE,
              assignedUserId: null,
              assignedUserName: null,
              primaryContactName: null,
              primaryContactEmail: null,
              primaryContactPhone: null,
              contactsCount: 0,
              openRequestsCount: 0,
              notes: 'Notes',
              contacts: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/clients')) {
          return new Response(
            JSON.stringify([
              {
                id: 'c-1',
                name: 'Oakridge Holdings Ltd',
                companyName: 'Oakridge Group',
                email: 'hello@oakridge.test',
                phone: '12345',
                address: 'London',
                referenceCode: 'OAK-1',
                entityType: ClientEntityType.LTD,
                country: OrganizationCountry.UK,
                status: ClientStatus.ACTIVE,
                assignedUserId: null,
                assignedUserName: null,
                primaryContactName: null,
                primaryContactEmail: null,
                primaryContactPhone: null,
                contactsCount: 0,
                openRequestsCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

    renderWithProviders(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText('Oakridge Holdings Ltd')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /edit oakridge holdings ltd/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/clients/c-1') && opts?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
    });

    fetchMock.mockRestore();
  });

  it('requires confirmation before saving edits on an issued RequestDetailPage and displays Reopen + Cancellation reason', async () => {
    currentId = 'req-cancelled';
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
        if (url.includes('/requests/req-cancelled/activity')) {
          return new Response(
            JSON.stringify([
              {
                id: 'a-1',
                actorType: AuditActorType.USER,
                actorUserId: 'u-1',
                action: 'DOCUMENT_REQUEST_CANCELLED',
                resourceType: 'document_request',
                resourceId: 'req-cancelled',
                metadata: { reason: 'Client requested deferral' },
                ipAddress: null,
                createdAt: '2026-10-10T10:00:00.000Z',
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (
          url.includes('/requests/req-cancelled/reopen') &&
          init?.method === 'POST'
        ) {
          return new Response(
            JSON.stringify({
              id: 'req-cancelled',
              status: RequestStatus.IN_PROGRESS,
              issuedPortalLink: {
                portalUrl: 'https://portal.test/portal/reopened-fresh-token',
                expiresAt: '2026-12-31T00:00:00.000Z',
                portalAccess: {
                  id: 'pa-new',
                  status: 'ACTIVE',
                  recipientEmail: 'claire@oakridge.test',
                  expiresAt: '2026-12-31T00:00:00.000Z',
                  revokedAt: null,
                  lastAccessedAt: null,
                  accessCount: 0,
                  createdAt: new Date().toISOString(),
                },
                emailDelivery: null,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/requests/req-cancelled')) {
          return new Response(
            JSON.stringify({
              id: 'req-cancelled',
              clientId: 'c-1',
              clientName: 'Oakridge Holdings Ltd',
              templateId: null,
              recurrenceId: null,
              periodKey: null,
              title: 'Annual Tax Return Pack',
              instructions: 'Provide schedules.',
              cancellationReason: 'Client requested deferral',
              status: RequestStatus.CANCELLED,
              isOverdue: false,
              dueAt: '2026-12-31T23:59:59.000Z',
              sentAt: '2026-10-05T10:00:00.000Z',
              completedAt: null,
              cancelledAt: '2026-10-10T10:00:00.000Z',
              totalItemsCount: 1,
              completedItemsCount: 0,
              createdAt: '2026-10-05T09:00:00.000Z',
              updatedAt: '2026-10-10T10:00:00.000Z',
              client: {
                id: 'c-1',
                name: 'Oakridge Holdings Ltd',
                companyName: 'Oakridge Group',
                referenceCode: 'OAK-001',
                entityType: ClientEntityType.LTD,
                country: OrganizationCountry.UK,
                status: ClientStatus.ACTIVE,
                email: 'accounts@oakridge.test',
                phone: null,
                address: null,
                primaryContactName: 'Claire Bennett',
                primaryContactEmail: 'claire@oakridge.test',
                primaryContactPhone: null,
              },
              recipientEmail: 'claire@oakridge.test',
              emailDelivery: {
                id: 'em-1',
                status: EmailStatus.DELIVERED,
                recipientEmail: 'claire@oakridge.test',
                templateName: 'document_request_sent',
                providerMessageId: 're_123',
                errorMessage: null,
                createdAt: '2026-10-05T10:00:00.000Z',
                updatedAt: '2026-10-05T10:01:00.000Z',
              },
              portalAccess: {
                id: 'pa-1',
                status: 'REVOKED',
                recipientEmail: 'claire@oakridge.test',
                expiresAt: '2026-12-01T10:00:00.000Z',
                revokedAt: '2026-10-10T10:00:00.000Z',
                lastAccessedAt: null,
                accessCount: 1,
                createdAt: '2026-10-05T10:00:00.000Z',
              },
              items: [
                {
                  id: 'item-1',
                  requestId: 'req-cancelled',
                  title: 'Bank Statement',
                  description: null,
                  isRequired: true,
                  status: RequestItemStatus.UPLOADED,
                  sortOrder: 0,
                  acceptedMimeTypes: ['application/pdf'],
                  createdAt: '2026-10-05T09:00:00.000Z',
                  updatedAt: '2026-10-06T09:00:00.000Z',
                },
              ],
              files: [],
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
      expect(screen.getByText('Client requested deferral')).toBeInTheDocument();
      expect(screen.getByText('Document request cancelled')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /reopen request/i }));
    await waitFor(() => {
      expect(
        screen.getByLabelText(/issue a fresh portal link immediately/i),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByLabelText(/issue a fresh portal link immediately/i),
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm reopen/i }));

    await waitFor(() => {
      const reopenCall = fetchMock.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/requests/req-cancelled/reopen') &&
          opts?.method === 'POST',
      );
      expect(reopenCall).toBeDefined();
      const body = JSON.parse(String(reopenCall?.[1]?.body));
      expect(body.issuePortalLink).toBe(true);
      expect(
        screen.getByDisplayValue(
          'https://portal.test/portal/reopened-fresh-token',
        ),
      ).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });

  it('prompts confirmation before modifying an already-issued request and protects items with files', async () => {
    currentId = 'req-sent';
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
        if (url.includes('/requests/req-sent/activity')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/requests/req-sent') && init?.method === 'PATCH') {
          return new Response(JSON.stringify({ id: 'req-sent' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/requests/req-sent')) {
          return new Response(
            JSON.stringify({
              id: 'req-sent',
              clientId: '11111111-1111-4111-8111-111111111111',
              clientName: 'Oakridge Holdings Ltd',
              templateId: null,
              recurrenceId: null,
              periodKey: null,
              title: 'Sent Request Title',
              instructions: 'Original',
              cancellationReason: null,
              status: RequestStatus.IN_PROGRESS,
              isOverdue: false,
              dueAt: '2026-12-31T23:59:59.000Z',
              sentAt: '2026-10-05T10:00:00.000Z',
              completedAt: null,
              cancelledAt: null,
              totalItemsCount: 2,
              completedItemsCount: 0,
              createdAt: '2026-10-05T09:00:00.000Z',
              updatedAt: '2026-10-05T10:00:00.000Z',
              items: [
                {
                  id: 'item-with-file',
                  requestId: 'req-sent',
                  title: 'Protected Item',
                  description: null,
                  isRequired: true,
                  status: RequestItemStatus.UPLOADED,
                  sortOrder: 0,
                  acceptedMimeTypes: ['application/pdf'],
                  createdAt: '2026-10-05T09:00:00.000Z',
                  updatedAt: '2026-10-05T10:00:00.000Z',
                },
                {
                  id: 'item-empty',
                  requestId: 'req-sent',
                  title: 'Optional Item',
                  description: null,
                  isRequired: false,
                  status: RequestItemStatus.PENDING,
                  sortOrder: 1,
                  acceptedMimeTypes: ['application/pdf'],
                  createdAt: '2026-10-05T09:00:00.000Z',
                  updatedAt: '2026-10-05T10:00:00.000Z',
                },
              ],
              files: [
                {
                  id: 'file-1',
                  requestId: 'req-sent',
                  requestItemId: 'item-with-file',
                  requestItemTitle: 'Protected Item',
                  originalFilename: 'bank.pdf',
                  sanitizedFilename: 'bank.pdf',
                  mimeType: 'application/pdf',
                  detectedMimeType: 'application/pdf',
                  sizeBytes: 1024,
                  scanStatus: FileScanStatus.CLEAN,
                  scanDetails: null,
                  uploadedAt: '2026-10-06T09:00:00.000Z',
                  createdAt: '2026-10-06T09:00:00.000Z',
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
      expect(
        screen.getAllByText('Protected Item').length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByRole('button', { name: 'Remove Protected Item' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Remove Optional Item' }),
      ).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: 'Updated Issued Title' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    // Confirmation modal intercepts PATCH until confirmed
    await waitFor(() => {
      expect(
        screen.getByText(/confirm update to issued request/i),
      ).toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some(
        ([u, opts]) =>
          String(u).includes('/requests/req-sent') && opts?.method === 'PATCH',
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /confirm update/i }));
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/requests/req-sent') && opts?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
    });

    fetchMock.mockRestore();
  });

  it('supports Create & send workflow in RequestsPage', async () => {
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
        if (url.includes('/clients')) {
          return new Response(
            JSON.stringify([
              {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Oakridge Holdings Ltd',
                companyName: null,
                email: null,
                phone: null,
                address: null,
                referenceCode: null,
                entityType: ClientEntityType.LTD,
                country: OrganizationCountry.UK,
                status: ClientStatus.ACTIVE,
                assignedUserId: null,
                assignedUserName: null,
                primaryContactName: 'Claire Bennett',
                primaryContactEmail: 'claire@oakridge.test',
                primaryContactPhone: null,
                contactsCount: 1,
                openRequestsCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/templates')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/requests/req-created/send') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 'req-created',
              recipientEmail: 'claire@oakridge.test',
              emailDelivery: {
                id: 'em-1',
                status: EmailStatus.SENT,
                recipientEmail: 'claire@oakridge.test',
                templateName: 'document_request_sent',
                providerMessageId: 're_123',
                errorMessage: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.includes('/requests') && init?.method === 'POST') {
          return new Response(JSON.stringify({ id: 'req-created' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

    renderWithProviders(<RequestsPage />);

    fireEvent.click(screen.getByRole('button', { name: /new request/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await waitFor(() => {
      const clientSelect = screen.getByLabelText(/^client$/i) as HTMLSelectElement;
      expect(
        Array.from(clientSelect.options).some(
          (o) => o.value === '11111111-1111-4111-8111-111111111111',
        ),
      ).toBe(true);
    });

    fireEvent.change(screen.getByLabelText(/^client$/i), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.change(screen.getByLabelText(/request title/i), {
      target: { value: 'Immediate Send Pack' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /create & send request/i }),
    );

    await waitFor(() => {
      const sendCall = fetchMock.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/requests/req-created/send') &&
          opts?.method === 'POST',
      );
      expect(sendCall).toBeDefined();
    });

    fetchMock.mockRestore();
  });
});
