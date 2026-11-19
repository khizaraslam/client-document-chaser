import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import * as React from 'react';
import { AppProviders } from '@/components/providers/query-provider';
import './globals.css';

const displayFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const bodyFont = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Client Document Chaser',
  description:
    'Multi-tenant SaaS platform for accounting firms and bookkeepers to request, collect, review, and automate client financial document workflows.',
  openGraph: {
    title: 'Client Document Chaser',
    description:
      'Multi-tenant SaaS platform for accounting firms and bookkeepers to request, collect, review, and automate client financial document workflows.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body className="min-h-screen bg-[#FAF9F6] text-[#334155]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
