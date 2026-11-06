import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {}, from: () => ({}) } }));
import { shouldShowLogoSkeleton } from '@/pages/Auth';

describe('logo do login', () => {
  it('skeleton apenas na primeira tentativa da configuração', () => {
    expect(shouldShowLogoSkeleton(true, 0)).toBe(true);
  });
  it('após falha/retry mostra a marca local em vez de esperar backoff', () => {
    expect(shouldShowLogoSkeleton(true, 1)).toBe(false);
  });
  it('configuração resolvida não mostra skeleton', () => {
    expect(shouldShowLogoSkeleton(false, 0)).toBe(false);
  });
});
