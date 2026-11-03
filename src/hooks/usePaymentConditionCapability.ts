import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useStorageAccessScope } from './useStorageAccessScope';
import { requirePaymentCapability } from '@/lib/comercial/paymentContract';

export function usePaymentConditionCapability(partnerId: string | null, enabled = true) {
  const { user, profile } = useAuth();
  const scope = useStorageAccessScope('partner-payment-condition');
  return useQuery({
    queryKey: ['partner-payment-condition', scope.scope, partnerId],
    enabled: enabled && scope.ready && !!partnerId,
    retry: false, staleTime: 0,
    queryFn: async () => {
      const current = scope.capture();
      if (!current() || !partnerId || !user?.id || !profile?.organization_id) throw new Error('payment_contract_unavailable');
      const { data, error } = await (supabase as any).rpc('partner_payment_condition_capability_v1', { p_partner_id: partnerId });
      if (error || !current()) throw new Error('payment_contract_unavailable');
      return requirePaymentCapability(data, user.id, profile.organization_id, partnerId);
    },
  });
}