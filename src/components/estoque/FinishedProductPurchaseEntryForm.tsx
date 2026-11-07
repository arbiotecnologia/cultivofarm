import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenantProducts } from "@/hooks/useTenantProducts";
import { useTenantProductVolumes } from "@/hooks/useTenantProductVolumes";
import { useProductPackagingState } from "@/hooks/useProductUnitAdmin";
import { useFinishedProductPurchaseEntry } from "@/hooks/useFinishedProductPurchase";
import { formatStockValue, type StockContentUnit } from "@/lib/estoque/stockUnits";
import type { FinishedProductPurchaseAck, FinishedProductPurchaseDraft } from "@/lib/estoque/finishedProductPurchase";

const emptyDraft = (): FinishedProductPurchaseDraft => ({
  produto_id: "",
  embalagem_id: "",
  lote_fornecedor: "",
  quantidade: "",
  compra_referencia: "",
  fornecedor_nome: "",
  validade: "",
});

interface PresentationOption {
  id: string;
  label: string;
}

export function FinishedProductPurchaseEntryForm({ onSuccess }: { onSuccess: (ack: FinishedProductPurchaseAck) => void }) {
  const [draft, setDraft] = useState<FinishedProductPurchaseDraft>(emptyDraft);
  const entry = useFinishedProductPurchaseEntry();
  const products = useTenantProducts(false);
  const packaging = useProductPackagingState(draft.produto_id, !!draft.produto_id);
  const volumes = useTenantProductVolumes(draft.produto_id, !!draft.produto_id);
  const unit = packaging.data?.unidade_conteudo ?? null;

  const eligibleProducts = useMemo(
    () => (products.data ?? []).filter((product) =>
      product.ativo === true && (product.familia_catalogo === "quimico" || product.familia_catalogo === "fertilizante_adubo")),
    [products.data],
  );

  const presentations = useMemo<PresentationOption[]>(() => {
    if (!unit) return [];
    const options: PresentationOption[] = [];
    if (unit === "kg" || unit === "g") {
      for (const offer of packaging.data?.offers ?? []) {
        if (!offer.ativo) continue;
        const content = offer.peso_liquido_kg * (unit === "g" ? 1000 : 1);
        options.push({
          id: offer.packaging_id,
          label: `${offer.codigo}${offer.descricao ? ` · ${offer.descricao}` : ""} · ${formatStockValue(content, unit)}`,
        });
      }
    } else {
      for (const volume of volumes.data ?? []) {
        if (!volume.ativo || volume.medida !== "volume") continue;
        const content = Number(volume.volume_ml) / (unit === "l" ? 1000 : 1);
        if (!Number.isFinite(content) || content <= 0) continue;
        options.push({
          id: volume.id,
          label: `${volume.rotulo?.trim() || "Apresentação"} · ${formatStockValue(content, unit as StockContentUnit)}`,
        });
      }
    }
    return options;
  }, [packaging.data, unit, volumes.data]);

  const update = <K extends keyof FinishedProductPurchaseDraft>(key: K, value: FinishedProductPurchaseDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    try {
      const ack = await entry.mutateAsync(draft);
      toast.success(ack.replay ? "Entrada já registrada; o mesmo recibo foi recuperado." : "Compra registrada no estoque.");
      setDraft(emptyDraft());
      onSuccess(ack);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a entrada.");
    }
  };

  const loadingPresentations = !!draft.produto_id && (packaging.isLoading || volumes.isLoading);
  const incomplete = !draft.produto_id || !draft.embalagem_id || !draft.lote_fornecedor.trim() ||
    !draft.quantidade || !draft.compra_referencia.trim() || !draft.fornecedor_nome.trim();

  return (
    <div className="form-spacing-mobile pt-2" aria-label="Compra de produto acabado para revenda">
      <p className="text-xs text-muted-foreground">
        Para químicos e fertilizantes do catálogo. A empresa e o conteúdo são confirmados pelo servidor; não passe por envase.
      </p>
      <div className="space-y-1.5">
        <Label>Produto do catálogo</Label>
        <Select
          value={draft.produto_id}
          onValueChange={(value) => setDraft((current) => ({ ...current, produto_id: value, embalagem_id: "" }))}
          disabled={entry.isPending}
        >
          <SelectTrigger aria-label="Produto para revenda"><SelectValue placeholder="Selecione químico ou fertilizante" /></SelectTrigger>
          <SelectContent>
            {eligibleProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.nome}</SelectItem>)}
            {!products.isLoading && eligibleProducts.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum químico ou fertilizante ativo no catálogo.</div>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Apresentação existente</Label>
        <Select value={draft.embalagem_id} onValueChange={(value) => update("embalagem_id", value)} disabled={!draft.produto_id || entry.isPending}>
          <SelectTrigger aria-label="Apresentação para revenda">
            <SelectValue placeholder={loadingPresentations ? "Carregando apresentações…" : "Selecione a apresentação"} />
          </SelectTrigger>
          <SelectContent>
            {presentations.map((presentation) => <SelectItem key={presentation.id} value={presentation.id}>{presentation.label}</SelectItem>)}
            {!loadingPresentations && draft.produto_id && presentations.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma apresentação ativa e compatível.</div>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Lote do fornecedor</Label><Input value={draft.lote_fornecedor} onChange={(event) => update("lote_fornecedor", event.target.value)} maxLength={120} /></div>
        <div className="space-y-1.5"><Label>Validade</Label><Input type="date" value={draft.validade} onChange={(event) => update("validade", event.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Fornecedor</Label><Input value={draft.fornecedor_nome} onChange={(event) => update("fornecedor_nome", event.target.value)} maxLength={200} /></div>
        <div className="space-y-1.5"><Label>Referência da compra</Label><Input value={draft.compra_referencia} onChange={(event) => update("compra_referencia", event.target.value)} maxLength={120} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Número inteiro de embalagens</Label>
        <Input aria-label="Embalagens compradas" type="number" min={1} step={1} inputMode="numeric" value={draft.quantidade} onChange={(event) => update("quantidade", event.target.value)} />
      </div>
      <Button className="w-full h-12 sm:h-10 font-bold" onClick={() => void submit()} disabled={incomplete || entry.isPending || loadingPresentations}>
        {entry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {entry.hasUncertainAttempt ? "Confirmar a mesma entrada" : "Registrar compra no estoque"}
      </Button>
    </div>
  );
}
