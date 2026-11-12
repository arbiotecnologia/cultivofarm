import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { OverloadSummary } from "@/lib/fiscal/eligibilityDiagnostic";
import { economicOperationalPending, ECONOMIC_OPERATIONAL_PENDING } from "@/lib/fiscal/orderEconomicStatus";

/** Selo curto para listas. */
export function AccountingPendingBadge() {
  return (
    <Badge variant="outline" className="border-destructive/40 text-destructive" data-testid="accounting-pending-badge">
      Contabilidade pendente
    </Badge>
  );
}

/**
 * Aviso honesto: o pedido foi registrado, mas a empresa fornecedora ainda não tem o cadastro
 * contábil/fiscal validado. Não promete aprovação, cobrança, nota fiscal nem entrega.
 */
export function AccountingPendingNotice({ audience, diagnosis }: { audience: "partner" | "commercial"; diagnosis?: OverloadSummary | null }) {
  return (
    <Alert variant="destructive" data-testid="accounting-pending-notice">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Pedido registrado — contabilidade da empresa fornecedora pendente</AlertTitle>
      <AlertDescription className="space-y-1 text-sm">
        {economicOperationalPending(diagnosis) ? (
          <p>{ECONOMIC_OPERATIONAL_PENDING}</p>
        ) : audience === "partner" ? (
          <p>
            Seu pedido foi recebido e pode ser analisado pelo comercial. Enquanto a validação contábil do
            fornecedor não for concluída, ele não pode ser aprovado, cobrado, faturado nem entregue. Não há
            prazo garantido para essas etapas.
          </p>
        ) : (
          <p>
            Pedido registrado sem emissor validado. Liberação operacional, cobrança, nota fiscal e
            entrega permanecem bloqueadas pelo servidor até a validação contábil real da empresa.
            As aprovações econômicas são apresentadas separadamente quando confirmadas pelo servidor.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
