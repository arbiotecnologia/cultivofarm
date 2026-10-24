/** Informational only: never mounts downstream readers or financial/fiscal writers. */
export function OrderJourney() {
  return <section aria-label="Percurso do pedido" className="space-y-2 border-y border-border py-3">
    <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {["Pedido", "Aprovação", "Financeiro", "Fiscal", "Entrega"].map((step, index) =>
        <li key={step}><span className="text-muted-foreground">{index + 1}.</span> {step}</li>)}
    </ol>
    <p className="text-xs text-muted-foreground">Cada etapa depende das autorizações e validações próprias. Aprovação comercial não confirma cobrança, emissão fiscal ou entrega.</p>
  </section>;
}