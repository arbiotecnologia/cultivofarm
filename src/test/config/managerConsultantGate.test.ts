import { describe, expect, it } from 'vitest';
import * as gates from '@/lib/authz/authzEpochGate';
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from '@/lib/authz/attachmentBlobGate';
describe('exact manager consultant candidate flags', () => {
  it('reviewed paired scope is ON', () => expect(gates.MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED).toBe(true));
  it('published scopes stay ON', () => {
    for (const enabled of [gates.AUTHZ_CACHE_FOUNDATION_ENABLED, gates.PRODUCER_CONTEXT_MONITOR_ENABLED,
      gates.FINANCIAL_CONTEXT_MONITOR_ENABLED, gates.COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED,
      gates.CONSULTANT_CONTEXT_MONITOR_ENABLED, gates.OPERATOR_CONTEXT_MONITOR_ENABLED]) expect(enabled).toBe(true);
  });
  it('global v6 closed; Blob authenticated active (signing removed)', () => {
    expect(gates.AUTHZ_CACHE_ROLLOUT_SCOPE).toBe('b2b-context');
    expect(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED).toBe(true);
  });
});
