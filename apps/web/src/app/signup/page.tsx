import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignupForm } from '@/components/auth/signup-form';

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your firm workspace"
      subtitle="Includes a full 14-day Starter trial with no card required."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[#0F766E] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
