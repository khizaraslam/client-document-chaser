import * as matchers from '@testing-library/jest-dom/matchers';
import { expect, vi } from 'vitest';

expect.extend(matchers);

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
