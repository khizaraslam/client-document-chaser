import { AcceptInviteSchema, COUNTRY_TIMEZONES, OrganizationCountry } from '@cdc/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/auth/login-form';
import { SignupForm } from '@/components/auth/signup-form';
import { apiRequest } from '@/lib/api-client';

describe('Auth Forms Validation & Submission', () => {
  it('shows validation errors on empty LoginForm submission', async () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('submits valid LoginForm credentials to /api/v1/auth/login', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 'u1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/work email/i), {
      target: { value: 'claire@vanceaccounting.co.uk' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'StrongPassword123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    fetchMock.mockRestore();
  });

  it('validates strong password and switches UK timezone in SignupForm', async () => {
    render(<SignupForm />);

    const countrySelect = screen.getByLabelText(/jurisdiction/i) as HTMLSelectElement;
    fireEvent.change(countrySelect, { target: { value: 'UK' } });

    const timezoneSelect = screen.getByLabelText(/firm timezone/i) as HTMLSelectElement;
    await waitFor(() => {
      expect(timezoneSelect.value).toBe('Europe/London');
    });

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Claire Vance' },
    });
    fireEvent.change(screen.getByLabelText(/work email/i), {
      target: { value: 'claire@vance.co.uk' },
    });
    fireEvent.change(screen.getByLabelText(/firm name/i), {
      target: { value: 'Vance Chartered' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'weak' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /create firm & start trial/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 10 characters long/i),
      ).toBeInTheDocument();
    });
  });

  it('AcceptInviteSchema allows empty optional fields for existing users and shares COUNTRY_TIMEZONES', () => {
    const existingUserParse = AcceptInviteSchema.safeParse({
      token: 'abcdef1234567890',
      fullName: '',
      password: '',
    });
    expect(existingUserParse.success).toBe(true);
    if (existingUserParse.success) {
      expect(existingUserParse.data.fullName).toBeUndefined();
      expect(existingUserParse.data.password).toBeUndefined();
    }

    expect(COUNTRY_TIMEZONES[OrganizationCountry.US]).toContain('America/Phoenix');
    expect(COUNTRY_TIMEZONES[OrganizationCountry.UK]).toEqual(['Europe/London']);
  });

  it('apiRequest attaches X-CSRF-Token on POST /auth/refresh retry after 401', async () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'cdc_csrf=csrf-token-xyz',
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    await apiRequest<{ ok: boolean }>('/auth/me');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall?.[0]).toBe('/api/v1/auth/refresh');
    const refreshHeaders = refreshCall?.[1]?.headers as Record<string, string>;
    expect(refreshHeaders['X-CSRF-Token']).toBe('csrf-token-xyz');

    fetchMock.mockRestore();
  });
});
