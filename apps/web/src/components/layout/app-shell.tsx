'use client';

import { AuthMeResponse } from '@cdc/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarClock,
  FileCheck2,
  Files,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiRequest, ApiClientError } from '@/lib/api-client';
import { cn, daysRemaining } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard },
  { href: '/app/clients', label: 'Clients', icon: FolderKanban },
  { href: '/app/requests', label: 'Requests', icon: FileCheck2 },
  { href: '/app/templates', label: 'Templates', icon: Files },
  { href: '/app/schedules', label: 'Schedules', icon: CalendarClock },
  { href: '/app/team', label: 'Team & Roles', icon: Users },
  { href: '/app/settings', label: 'Firm Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiRequest<AuthMeResponse>('/auth/me'),
    retry: false,
  });

  React.useEffect(() => {
    if (meQuery.isError) {
      router.replace('/login');
    }
  }, [meQuery.isError, router]);

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
    onError: () => {
      router.replace('/login');
    },
  });

  const resendVerifyMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ dispatched: boolean; message: string }>(
        '/auth/resend-verification',
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      notify({
        variant: res.dispatched ? 'success' : 'error',
        title: res.dispatched
          ? 'Verification email sent'
          : 'Email dispatch unavailable',
        description: res.message,
      });
    },
    onError: (err) => {
      notify({
        variant: 'error',
        title: 'Could not send verification email',
        description:
          err instanceof ApiClientError ? err.message : 'Unexpected error',
      });
    },
  });

  if (meQuery.isLoading || !meQuery.data) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex">
        <aside className="hidden md:block w-64 border-r border-[#E2E0D8] bg-white p-6">
          <div className="h-6 w-40 rounded bg-[#F3F1EC] animate-pulse" />
          <div className="mt-8 space-y-3">
            <div className="h-9 w-full rounded bg-[#F3F1EC] animate-pulse" />
            <div className="h-9 w-full rounded bg-[#F3F1EC] animate-pulse" />
            <div className="h-9 w-full rounded bg-[#F3F1EC] animate-pulse" />
          </div>
        </aside>
        <div className="flex-1 p-8">
          <div className="h-8 w-56 rounded bg-[#F3F1EC] animate-pulse" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="h-28 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
            <div className="h-28 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
            <div className="h-28 rounded-lg bg-white border border-[#E2E0D8] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const me = meQuery.data;
  const trialDaysLeft = daysRemaining(me.subscription.trialEndsAt);

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col md:flex-row">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r border-[#E2E0D8] bg-white flex flex-col justify-between transition-transform md:static md:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div>
          <div className="flex items-center justify-between border-b border-[#E2E0D8] px-6 py-4">
            <Link
              href="/app"
              className="font-display text-base font-bold text-[#0F172A] truncate"
            >
              Client Document Chaser
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden rounded p-1 text-[#64748B]"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-[#E2E0D8] px-6 py-4">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-[#0F172A]">
              <Building2 className="h-4 w-4 shrink-0 text-[#0F766E]" />
              <span className="truncate">{me.organization.name}</span>
            </div>
            <p className="mt-1 text-xs text-[#64748B] truncate">
              {me.organization.country} · {me.organization.timezone}
            </p>
          </div>

          <nav className="p-4 space-y-1" aria-label="Workspace navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/app'
                  ? pathname === '/app'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-[#F0FDFA] text-[#0F766E]'
                      : 'text-[#475569] hover:bg-[#F3F1EC] hover:text-[#0F172A]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[#E2E0D8] p-4 space-y-3">
          <div className="px-2 text-xs text-[#475569]">
            <p className="font-medium text-[#0F172A] truncate">
              {me.user.fullName}
            </p>
            <p className="mt-0.5 truncate text-[#64748B]">
              {me.membership.role} · {me.subscription.planName}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-4 w-4" />
            <span>{logoutMutation.isPending ? 'Signing out...' : 'Sign out'}</span>
          </Button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-[#E2E0D8] bg-white px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden rounded-md border border-[#D6D3C9] p-2 text-[#0F172A]"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-[#475569]">
              Firm Workspace
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-[#475569] tabular-nums">
            <span>
              {me.subscription.status === 'TRIALING'
                ? `Trial: ${trialDaysLeft} days remaining`
                : `Subscription: ${me.subscription.status}`}
            </span>
          </div>
        </header>

        {!me.user.emailVerified && (
          <div className="border-b border-[#FDE68A] bg-[#FFFBEB] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-[#92400E]">
              Verify your email address ({me.user.email}) to activate full
              firm security notifications.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => resendVerifyMutation.mutate()}
              disabled={resendVerifyMutation.isPending}
            >
              {resendVerifyMutation.isPending
                ? 'Sending...'
                : 'Resend verification email'}
            </Button>
          </div>
        )}

        {me.subscription.isReadOnly && (
          <div className="border-b border-[#FECACA] bg-[#FEF2F2] px-6 py-3 text-xs sm:text-sm text-[#991B1B]">
            Your 14-day trial has expired. Workspace write operations are
            paused in read-only mode.
          </div>
        )}

        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full">{children}</main>
      </div>
    </div>
  );
}
