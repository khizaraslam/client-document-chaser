import Link from 'next/link';
import { ArrowRight, Check, FileCheck2, Lock, MailCheck, Repeat } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#334155]">
      <header className="border-b border-[#E2E0D8] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0"
          >
            Client Document Chaser
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#475569]">
            <a
              href="#workflow"
              className="hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Workflow
            </a>
            <a
              href="#security"
              className="hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Security
            </a>
            <a
              href="#pricing"
              className="hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <Link
              href="/login"
              className="hover:text-[#0F172A] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              Sign in
            </Link>
          </nav>

          <div className="shrink-0">
            <Link
              href="/signup"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[#0F766E] px-4 text-sm font-medium text-white hover:bg-[#0D9488] transition-colors whitespace-nowrap shrink-0"
            >
              Start 14-day trial
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-[#E2E0D8] bg-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-12 lg:items-stretch lg:py-24">
            <div className="flex flex-col justify-center lg:col-span-7">
              <p className="text-sm font-medium text-[#0F766E]">
                Built for US and UK accounting firms and bookkeepers
              </p>
              <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl text-balance leading-[1.12]">
                Collect client financial records without chasing email threads.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#475569]">
                Send structured document checklists, verify clients through a
                passwordless portal, review quarantined uploads, and automate
                overdue follow-ups on your firm&apos;s local calendar.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-[#0F766E] px-6 text-sm font-medium text-white hover:bg-[#0D9488] transition-colors whitespace-nowrap shrink-0"
                >
                  Create firm workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center rounded-md border border-[#D6D3C9] bg-white px-5 text-sm font-medium text-[#0F172A] hover:bg-[#F3F1EC] transition-colors whitespace-nowrap shrink-0"
                >
                  Sign in to workspace
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#64748B]">
                <span>14-day free trial</span>
                <span aria-hidden="true">·</span>
                <span>No client account signup required</span>
                <span aria-hidden="true">·</span>
                <span>US &amp; UK timezone scheduling</span>
              </div>
            </div>

            <div className="lg:col-span-5 flex">
              <div className="flex w-full flex-col justify-between rounded-lg border border-[#E2E0D8] bg-[#FAF9F6] p-6">
                <div>
                  <div className="flex items-center justify-between border-b border-[#E2E0D8] pb-4">
                    <span className="text-sm font-semibold text-[#0F172A]">
                      Q3 VAT &amp; Payroll Close
                    </span>
                    <span className="font-mono-tabular text-xs text-[#475569]">
                      Due Nov 22
                    </span>
                  </div>
                  <div className="mt-5 space-y-4">
                    <div className="flex items-start justify-between gap-4 border-b border-[#E2E0D8] pb-3">
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">
                          Lloyds Business Current Statement
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          Required · PDF or CSV
                        </p>
                      </div>
                      <span className="text-xs font-medium text-[#0F766E] whitespace-nowrap">
                        Accepted
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4 border-b border-[#E2E0D8] pb-3">
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">
                          Payroll Summary &amp; RTI Submission
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          Required · Under review
                        </p>
                      </div>
                      <span className="text-xs font-medium text-[#D97706] whitespace-nowrap">
                        Under review
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">
                          Purchase Invoices Over £1,000
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          Required · Automated reminder in 3 days
                        </p>
                      </div>
                      <span className="text-xs font-medium text-[#475569] whitespace-nowrap">
                        Pending
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-[#E2E0D8] pt-4 text-xs text-[#64748B] flex items-center justify-between">
                  <span>Private S3 quarantine active</span>
                  <span className="font-mono-tabular text-[#0F172A]">
                    1 / 3 verified
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
              Built around how practice managers actually close books
            </h2>
            <p className="mt-3 text-base text-[#475569]">
              Every document request runs from immutable checklist snapshots,
              role-gated review queues, and timezone-aware reminder schedules.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[#E2E0D8] bg-white p-6">
              <FileCheck2 className="h-5 w-5 text-[#0F766E]" />
              <h3 className="mt-4 text-base font-semibold text-[#0F172A]">
                01. Checklist snapshots
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                Launch requests from tax, VAT, or month-end templates. Editing a
                master template never alters active client checklists.
              </p>
            </div>

            <div className="rounded-lg border border-[#E2E0D8] bg-white p-6">
              <Lock className="h-5 w-5 text-[#0F766E]" />
              <h3 className="mt-4 text-base font-semibold text-[#0F172A]">
                02. Passwordless portal
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                Clients verify via scoped invitation link and optional OTP, then
                upload directly to private object storage.
              </p>
            </div>

            <div className="rounded-lg border border-[#E2E0D8] bg-white p-6">
              <MailCheck className="h-5 w-5 text-[#0F766E]" />
              <h3 className="mt-4 text-base font-semibold text-[#0F172A]">
                03. Accept or reject
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                Inspect scanned files, accept complete records, or reject
                blurry scans with clear notes so clients re-upload immediately.
              </p>
            </div>

            <div className="rounded-lg border border-[#E2E0D8] bg-white p-6">
              <Repeat className="h-5 w-5 text-[#0F766E]" />
              <h3 className="mt-4 text-base font-semibold text-[#0F172A]">
                04. Quiet-hours reminders
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                Schedule monthly, quarterly, and annual chases that stop the
                moment every required item is accepted.
              </p>
            </div>
          </div>
        </section>

        <section
          id="security"
          className="border-y border-[#E2E0D8] bg-white py-16"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
                Strict tenant isolation and private file custody
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                Designed for sensitive tax returns, bank statements, and payroll
                ledgers from day one.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
              <div className="border-t border-[#E2E0D8] pt-4">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Private S3 presigned transfers
                </h3>
                <p className="mt-1.5 text-sm text-[#475569]">
                  Zero public file URLs. Every upload and download uses a
                  short-lived signed URL after server-side permission checks.
                </p>
              </div>
              <div className="border-t border-[#E2E0D8] pt-4">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Quarantine before review
                </h3>
                <p className="mt-1.5 text-sm text-[#475569]">
                  Files are validated by magic-byte MIME inspection and malware
                  scanning before accountants open them.
                </p>
              </div>
              <div className="border-t border-[#E2E0D8] pt-4">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Argon2id &amp; rotating sessions
                </h3>
                <p className="mt-1.5 text-sm text-[#475569]">
                  Passwords are hashed with Argon2id; refresh tokens rotate with
                  automatic family revocation upon reuse detection.
                </p>
              </div>
              <div className="border-t border-[#E2E0D8] pt-4">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Role-scoped audit trail
                </h3>
                <p className="mt-1.5 text-sm text-[#475569]">
                  Owner, Admin, and Staff roles enforced at the API and database
                  query layers with an immutable firm audit log.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
              Clear pricing scaled by active clients
            </h2>
            <p className="mt-2 text-base text-[#475569]">
              Every firm starts with a full 14-day trial. No credit card is
              required during setup.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-[#E2E0D8] bg-white p-8 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[#475569]">
                  For solo bookkeepers and boutique practices
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-[#0F172A] tabular-nums">
                    $19
                  </span>
                  <span className="text-sm text-[#64748B]">
                    / month (proposed)
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-[#0F172A]">
                  Starter
                </h3>
                <ul className="mt-6 space-y-3 text-sm text-[#334155]">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">Up to 50 active clients</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">Up to 5 firm team seats</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">10 GB private document storage</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">2,500 automated emails / month</span>
                  </li>
                </ul>
              </div>
              <Link
                href="/signup"
                className="mt-8 inline-flex h-10 w-full items-center justify-center rounded-md border border-[#D6D3C9] bg-white text-sm font-medium text-[#0F172A] hover:bg-[#F3F1EC] transition-colors"
              >
                Start 14-day trial
              </Link>
            </div>

            <div className="rounded-lg border border-[#0F766E] bg-white p-8 flex flex-col justify-between">
              <div>
                <p className="text-sm font-medium text-[#0F766E]">
                  For growing multi-partner accounting firms
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-[#0F172A] tabular-nums">
                    $39
                  </span>
                  <span className="text-sm text-[#64748B]">
                    / month (proposed)
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-[#0F172A]">
                  Professional
                </h3>
                <ul className="mt-6 space-y-3 text-sm text-[#334155]">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">Up to 250 active clients</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">Up to 25 firm team seats</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">100 GB private document storage</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-[#0F766E] shrink-0" />
                    <span className="tabular-nums">15,000 automated emails / month</span>
                  </li>
                </ul>
              </div>
              <Link
                href="/signup"
                className="mt-8 inline-flex h-10 w-full items-center justify-center rounded-md bg-[#0F766E] text-sm font-medium text-white hover:bg-[#0D9488] transition-colors"
              >
                Start 14-day trial
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2E0D8] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#64748B]">
            Client Document Chaser · Secure document workflows for accounting
            practices
          </p>
          <div className="flex items-center gap-6 text-xs text-[#475569]">
            <Link href="/login" className="hover:text-[#0F172A]">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-[#0F172A]">
              Create firm
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
