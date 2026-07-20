import { useAlertasResumo } from "@/hooks/useAlertasResumo";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  compact?: boolean;
}

/**
 * Badge dinâmico para o item "Alertas" do menu lateral.
 * - Mostra n.º de críticos com destaque se houver críticos.
 * - Caso contrário, mostra total de abertos.
 * - Esconde para perfis sem permissão (cliente_produtor / financeiro).
 */
export function AlertasBadgeMenu({ className, compact }: Props) {
  const { podeVer, totalAbertos, totalCriticos, loading } = useAlertasResumo({
    limitePrioritarios: 1,
    limiteRecentes: 1,
  });

  if (!podeVer || loading) return null;
  if (totalAbertos === 0 && totalCriticos === 0) return null;

  const isCritico = totalCriticos > 0;
  const valor = isCritico ? totalCriticos : totalAbertos;

  return (
    <span
      title={
        isCritico
          ? `${totalCriticos} alerta(s) crítico(s) — ${totalAbertos} abertos`
          : `${totalAbertos} alerta(s) aberto(s)`
      }
      className={cn(
        "ml-auto inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none",
        compact ? "h-4 min-w-[16px] px-1" : "h-5 min-w-[20px] px-1.5",
        isCritico
          ? "bg-destructive text-destructive-foreground animate-pulse"
          : "bg-primary text-primary-foreground",
        className
      )}
    >
      {valor > 99 ? "99+" : valor}
    </span>
  );
}
