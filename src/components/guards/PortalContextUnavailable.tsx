import { ErrorRecovery } from "@/components/ErrorRecovery";
import { useAuth } from "@/hooks/useAuth";

/** Unavailable is not denied. The reviewed monitor's Retry re-resolves authority. */
export function PortalContextUnavailable({ refetch }: { refetch: () => unknown }) {
  const { revalidateAuthz, authzEpoch = 0 } = useAuth();
  return <ErrorRecovery
    title="Não foi possível confirmar este acesso"
    message="A consulta de acesso está indisponível no momento. Tente novamente."
    onRetry={() => {
      revalidateAuthz();
      // Gate-off/legacy scope has no monitored epoch transition to restart its query.
      if (authzEpoch === 0) void refetch();
    }}
  />;
}