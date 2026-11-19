import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in to your firm"
      subtitle="Access client checklists, review uploads, and team schedules."
      footer={
        <>
          Need a workspace for your practice?{' '}
          <Link href="/signup" className="font-medium text-[#0F766E] hover:underline">
            Start a 14-day trial
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
