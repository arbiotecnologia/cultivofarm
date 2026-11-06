import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePackagingAdminSave } from "@/hooks/usePackagingAdmin";
import { cents, weightKg, type AdminState, type Command, type Offer } from "@/lib/catalogo/packagingAdminContract";
import { toast } from "sonner";

/** Administrative content of the existing presentation dialog, never a buyer/order surface. */
export function SolidPresentations({ state, active = true, onLockChange }: { state: AdminState; active?: boolean; onLockChange?: (locked: boolean) => void }) {
  const save = usePackagingAdminSave(state.product_id, active);
  const running = useRef(false);
  const locked = save.isPending || save.retained;
  useEffect(() => { onLockChange?.(locked); }, [locked, onLockChange]);
  const [code, setCode] = useState(""); const [label, setLabel] = useState(""); const [weight, setWeight] = useState("");
  const [editing, setEditing] = useState<Offer | null>(null);
  const [price, setPrice] = useState(""); const [date, setDate] = useState(""); const [priceOffer, setPriceOffer] = useState("");
  const unit = state.unidade_conteudo === "g" ? "g" : "kg";
  const run = async (command: Command | null) => {
    if (running.current || !active) return;
    running.current = true; onLockChange?.(true);
    try {
      await save.mutateAsync(command);
      if (command === null || command.rpc === "solid_pack_offer_save_v1") { setEditing(null); setCode(""); setLabel(""); setWeight(""); }
      if (command === null || command.rpc === "solid_pack_price_set_v1") { setPriceOffer(""); setPrice(""); setDate(""); }
      toast.success("Alteração confirmada");
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "Alteração não confirmada"); }
    finally { running.current = false; }
  };
  const offerCommand = () => {
    try { void run({ rpc: "solid_pack_offer_save_v1", args: { p_product: state.product_id, p_packaging_id: editing?.packaging_id ?? null,
      p_codigo: code.trim(), p_descricao: label.trim() || null, p_peso_liquido_kg: weightKg(weight, unit), p_expected_version: editing?.version ?? null } }); }
    catch (error) { toast.error((error as Error).message); }
  };
  const submitPrice = () => {
    try {
      const offer = state.offers.find(o => o.packaging_id === priceOffer && o.ativo);
      if (!offer || !date) throw new Error("Selecione a apresentação e a vigência");
      const candidates = offer.prices.filter(p => p.ativo && p.valid_from <= date && (p.valid_until === null || p.valid_until >= date));
      if (candidates.length > 1) throw new Error("Preço vigente ambíguo");
      void run({ rpc: "solid_pack_price_set_v1", args: { p_packaging_id: offer.packaging_id, p_preco_centavos: cents(price), p_valid_from: date, p_expected_price_id: candidates[0]?.price_id ?? null } });
    } catch (error) { toast.error((error as Error).message); }
  };
  return <div className="space-y-4">
    {save.retained && <div role="alert"><p>Alteração não confirmada. Retome a tentativa original antes de fazer outra alteração.</p><Button disabled={save.isPending || !active} onClick={() => void run(null)}>Retomar tentativa original</Button></div>}
    <Table><TableHeader><TableRow><TableHead>Apresentação</TableHead><TableHead>Peso líquido</TableHead><TableHead>Versão</TableHead><TableHead>Preços por embalagem</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{state.offers.map(offer => <TableRow key={offer.packaging_id}>
        <TableCell>{offer.codigo} · {offer.descricao}</TableCell><TableCell>{offer.peso_liquido_kg} kg</TableCell><TableCell>{offer.version} · {offer.ativo ? "Ativa" : "Arquivada"}</TableCell>
        <TableCell>{offer.prices.length ? offer.prices.map(p => <div key={p.price_id}>{(p.preco_centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {p.valid_from} · {p.ativo ? "Ativo" : "Histórico"}</div>) : "Sem preço"}</TableCell>
        <TableCell><div className="flex flex-wrap gap-2">
          {offer.ativo && <Button variant="outline" disabled={locked || !active} onClick={() => { setEditing(offer); setCode(offer.codigo); setLabel(offer.descricao ?? ""); setWeight(String(offer.peso_liquido_kg * (unit === "g" ? 1000 : 1))); }}>Editar</Button>}
          <Button variant="outline" disabled={locked || !active} onClick={() => void run({ rpc: offer.ativo ? "solid_pack_offer_archive_v1" : "solid_pack_offer_reactivate_v1", args: { p_packaging_id: offer.packaging_id, p_expected_version: offer.version } })}>{offer.ativo ? "Arquivar" : "Reativar"}</Button>
          {offer.ativo && <Button variant="outline" disabled={locked || !active} onClick={() => setPriceOffer(offer.packaging_id)}>Preço</Button>}
        </div></TableCell></TableRow>)}</TableBody></Table>
    <div className="grid gap-3 sm:grid-cols-3">
      <div><Label htmlFor="pack-code">Código</Label><Input id="pack-code" value={code} disabled={!!editing || locked} onChange={e => setCode(e.target.value)} /></div>
      <div><Label htmlFor="pack-label">Descrição</Label><Input id="pack-label" value={label} disabled={locked || !active} onChange={e => setLabel(e.target.value)} /></div>
      <div><Label htmlFor="pack-weight">Peso líquido ({unit})</Label><Input id="pack-weight" value={weight} disabled={locked || !active} onChange={e => setWeight(e.target.value)} /></div>
      <Button disabled={locked || !active} onClick={offerCommand}>{editing ? "Salvar nova versão" : "Adicionar apresentação"}</Button>
      {editing && <Button variant="outline" disabled={locked || !active} onClick={() => { setEditing(null); setCode(""); setLabel(""); setWeight(""); }}>Cancelar edição</Button>}
    </div>
    {priceOffer && <div className="grid gap-3 sm:grid-cols-3">
      <div><Label htmlFor="pack-price">Preço por embalagem (R$)</Label><Input id="pack-price" value={price} disabled={locked || !active} onChange={e => setPrice(e.target.value)} /></div>
      <div><Label htmlFor="pack-date">Vigência</Label><Input id="pack-date" type="date" value={date} disabled={locked || !active} onChange={e => setDate(e.target.value)} /></div>
      <Button disabled={locked || !active} onClick={submitPrice}>Salvar preço</Button>
    </div>}
  </div>;
}