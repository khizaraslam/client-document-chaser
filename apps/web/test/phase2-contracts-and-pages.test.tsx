import {
  ClientEntityType,
  ClientStatus,
  CreateClientSchema,
  CreateDocumentRequestSchema,
  CreateRecurrenceSchema,
  CreateTemplateSchema,
  OrganizationCountry,
  PlanCode,
  RecurrenceFrequency,
  RequestStatus,
  SubscriptionStatus,
  TemplateCategory,
  UserRole,
} from '@cdc/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ClientsPage from '@/app/app/clients/page';
import RequestsPage from '@/app/app/requests/page';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
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

const MOCK_ME_RESPONSE = {
  user: {
    id: 'u-1',
    email: 'claire@vanceaccounting.co.uk',
    fullName: 'Claire Vance',
    emailVerified: true,
    lastLoginAt: null,
  },
  membership: {
    id: 'm-1',
    role: UserRole.OWNER,
  },
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

describe('Phase 2 Contracts & Workspace Pages', () => {
  it('validates Phase 2 client, template, request, and recurrence schemas', () => {
    expect(
      CreateClientSchema.safeParse({
        name: 'Oakridge Holdings Ltd',
        entityType: ClientEntityType.LTD,
        country: OrganizationCountry.UK,
        primaryContact: {
          fullName: 'Claire Bennett',
          email: 'claire@oakridge.co.uk',
        },
      }).success,
    ).toBe(true);

    expect(
      CreateTemplateSchema.safeParse({
        name: 'Empty Checklist',
        category: TemplateCategory.GENERAL,
        items: [],
      }).success,
    ).toBe(false);

    expect(
      CreateDocumentRequestSchema.safeParse({
        clientId: '11111111-1111-4111-8111-111111111111',
        title: 'Missing Items & Template',
        dueAt: '2026-12-31',
        items: [],
      }).success,
    ).toBe(false);

    expect(
      CreateRecurrenceSchema.safeParse({
        clientId: '11111111-1111-4111-8111-111111111111',
        templateId: '22222222-2222-4222-8222-222222222222',
        titleTemplate: 'Monthly Close — {{period}}',
        frequency: RecurrenceFrequency.MONTHLY,
        dayOfMonth: 31,
      }).success,
    ).toBe(false);
  });

  it('renders ClientsPage directory and submits Add Client modal to /api/v1/clients', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth/me')) {
        return new Response(JSON.stringify(MOCK_ME_RESPONSE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/memberships')) {
        return new Response(
          JSON.stringify({
            members: [
              {
                id: 'm-1',
                userId: 'u-1',
                fullName: 'Claire Vance',
                email: 'claire@vanceaccounting.co.uk',
                role: UserRole.OWNER,
                status: 'ACTIVE',
                emailVerified: true,
                createdAt: new Date().toISOString(),
              },
            ],
            pendingInvitations: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/clients') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify([
            {
              id: 'c-1',
              name: 'Oakridge Holdings Ltd',
              referenceCode: 'OAK-01',
              entityType: ClientEntityType.LTD,
              country: OrganizationCountry.UK,
              status: ClientStatus.ACTIVE,
              assignedUserId: 'u-1',
              assignedUserName: 'Claire Vance',
              primaryContactName: 'Claire Bennett',
              primaryContactEmail: 'claire@oakridge.co.uk',
              contactsCount: 1,
              openRequestsCount: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/clients') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ id: 'c-2', name: 'Harbor Dental LLP' }),
          { status: 201, headers: { 'content-type': 'application/json' } },
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
      expect(screen.getByText('Claire Bennett')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add client/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('dialog'),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/client \/ entity name/i), {
      target: { value: 'Harbor Dental LLP' },
    });
    fireEvent.change(screen.getByLabelText(/contact full name/i), {
      target: { value: 'Dr. Nina Patel' },
    });
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: 'nina@harbordental.co.uk' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create client/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/api/v1/clients') && opts?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.name).toBe('Harbor Dental LLP');
      expect(body.primaryContact.email).toBe('nina@harbordental.co.uk');
    });

    fetchMock.mockRestore();
  });

  it('renders RequestsPage with overdue status indicator and checklist progress', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth/me')) {
        return new Response(JSON.stringify(MOCK_ME_RESPONSE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/clients')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/requests')) {
        return new Response(
          JSON.stringify([
            {
              id: 'r-1',
              clientId: 'c-1',
              clientName: 'Oakridge Holdings Ltd',
              templateId: null,
              recurrenceId: null,
              periodKey: '2025-10',
              title: 'October 2025 Bookkeeping Close',
              status: RequestStatus.SENT,
              isOverdue: true,
              dueAt: '2025-11-05T23:59:59.000Z',
              sentAt: '2025-10-31T10:00:00.000Z',
              completedAt: null,
              cancelledAt: null,
              totalItemsCount: 3,
              completedItemsCount: 1,
              createdAt: '2025-10-31T09:00:00.000Z',
              updatedAt: '2025-10-31T10:00:00.000Z',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    renderWithProviders(<RequestsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('October 2025 Bookkeeping Close'),
      ).toBeInTheDocument();
      expect(screen.getByText('1 / 3 items')).toBeInTheDocument();
      expect(
        screen.getByText('Overdue', { selector: 'span' }),
      ).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });
});
