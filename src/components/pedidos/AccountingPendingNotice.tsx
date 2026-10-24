import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

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
export function AccountingPendingNotice({ audience }: { audience: "partner" | "commercial" }) {
  return (
    <Alert variant="destructive" data-testid="accounting-pending-notice">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Pedido registrado — contabilidade da empresa fornecedora pendente</AlertTitle>
      <AlertDescription className="space-y-1 text-sm">
        {audience === "partner" ? (
          <p>
            Seu pedido foi recebido e pode ser analisado pelo comercial. Enquanto a validação contábil do
            fornecedor não for concluída, ele não pode ser aprovado, cobrado, faturado nem entregue. Não há
            prazo garantido para essas etapas.
          </p>
        ) : (
          <p>
            Pedido registrado sem emissor validado. Aprovação, decisão de crédito, cobrança, nota fiscal e
            entrega permanecem bloqueadas pelo servidor até a validação contábil real da empresa e a
            promoção explícita do pedido.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
