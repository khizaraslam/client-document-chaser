import type { Metadata } from 'next';
import * as React from 'react';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: 'Workspace · Client Document Chaser',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
