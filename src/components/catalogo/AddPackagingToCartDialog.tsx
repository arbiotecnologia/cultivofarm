import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/financial/format";
import { isWholePackagingQty, packagingLabel, type PackagingOffer } from "@/lib/comercial/packagingOrder";

const kg = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export interface AddPackagingPayload { offer: PackagingOffer; quantidade: number }

/**
 * Escolha de embalagem INTEIRA. Quantidade = número de embalagens (inteiro > 0); sem venda fracionada.
 * Peso é informativo (frete). Preço exibido é o de tabela; o valor final vem da simulação do servidor.
 */
export function AddPackagingToCartDialog({ open, onOpenChange, nome, offers, onConfirm }: {
  open: boolean; onOpenChange: (v: boolean) => void; nome: string | null;
  offers: PackagingOffer[]; onConfirm: (p: AddPackagingPayload) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  useEffect(() => { if (open) { setSel(offers.length === 1 ? offers[0].packaging_id : null); setQty("1"); } }, [open, offers]);
  const offer = offers.find((o) => o.packaging_id === sel) ?? null;
  const q = qty.trim() === "" ? NaN : Number(qty);
  const qtyOk = isWholePackagingQty(q);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{nome ?? "Produto"}</DialogTitle>
          <DialogDescription>Escolha a embalagem. Vendemos somente embalagens inteiras.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="radiogroup" aria-label="Embalagens disponíveis">
          {offers.map((o) => (
            <button key={o.packaging_id} type="button" role="radio" aria-checked={sel === o.packaging_id}
              onClick={() => setSel(o.packaging_id)}
              className={`w-full text-left border rounded-md p-2 text-sm ${sel === o.packaging_id ? "border-primary bg-primary/5" : ""}`}>
              <div className="font-medium">{packagingLabel(o)}</div>
              <div className="text-xs text-muted-foreground">
                Peso líquido {kg.format(o.peso_liquido_kg)} kg · tabela {brl(o.preco_tabela_brl)} por embalagem
              </div>
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="pk-qty">Quantidade de embalagens</Label>
          <Input id="pk-qty" type="number" min={1} step={1} inputMode="numeric" value={qty}
            aria-invalid={!qtyOk} onChange={(e) => setQty(e.target.value)} />
          {!qtyOk && <p className="text-[11px] text-destructive">Informe um número inteiro de embalagens maior que zero.</p>}
          {offer && qtyOk && (
            <p className="text-xs text-muted-foreground">
              Peso total para frete: {kg.format(offer.peso_liquido_kg * q)} kg. O valor final é confirmado na simulação.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!offer || !qtyOk} onClick={() => { if (offer && qtyOk) { onConfirm({ offer, quantidade: q }); onOpenChange(false); } }}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
