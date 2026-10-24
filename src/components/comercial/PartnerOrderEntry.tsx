import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderJourney } from "./OrderJourney";

/** Receives existing layout gates, not raw IDs/roles as proof of authority. */
export function PartnerOrderEntry({ canReadCatalog, canCreate, pending = false }: {
  canReadCatalog: boolean; canCreate: boolean; pending?: boolean;
}) {
  return <section aria-label="Comprar para minha empresa" className="space-y-3 mb-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Comprar para minha empresa</h2>
      {canReadCatalog && !pending && <Button asChild variant={canCreate ? "default" : "outline"}>
        <Link to="/portal-parceiro/catalogo"><ShoppingCart aria-hidden="true" />{canCreate ? "Selecionar produto / Novo pedido" : "Consultar produtos"}</Link>
      </Button>}
    </div>
    <p role="status" className="text-sm text-muted-foreground">{pending
      ? "Verificando disponibilidade do catálogo e do pedido."
      : canCreate ? "Pedido para a empresa vinculada ao seu acesso, sujeito à análise comercial."
      : canReadCatalog ? "Catálogo disponível para consulta. A criação de pedidos não está autorizada neste acesso."
      : "Catálogo e criação de pedido indisponíveis neste acesso."}</p>
    {!canCreate && !pending && <details className="text-sm">
      <summary className="cursor-pointer text-primary">Detalhes das pendências</summary>
      <div className="space-y-2 py-2 text-muted-foreground">
        <p>{canReadCatalog ? "A autorização de consulta não libera o carrinho. O servidor não informou um motivo específico para a indisponibilidade de criação."
          : "O acesso depende do vínculo da empresa, do perfil, do plano e das capacidades confirmadas pelo servidor. Esta tela não identifica qual requisito impediu o acesso."}</p>
        <p>A equipe responsável deve conferir a liberação de pedidos e os requisitos comerciais e contábeis. Nenhuma validação ou liberação é feita aqui.</p>
      </div>
    </details>}
    <OrderJourney />
  </section>;
}