import { useEffect, useState } from "react";
import {
  useCommercialCampaigns,
  useSaveCampaign,
  useDeleteCampaign,
  useCampaignPartners,
  useSetCampaignPartners,
  useCampaignClientes,
  useSetCampaignClientes,
  type CampaignPublico,
} from "@/hooks/useCommercial";
import { useParceirosB2B } from "@/hooks/useParceirosB2B";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateDisplay } from "@/lib/date-utils";
import { Plus, Trash } from "lucide-react";

const publicoLabel: Record<CampaignPublico, string> = {
  b2b: "Parceiros B2B",
  comercial: "Clientes (Comercial)",
  ambos: "Ambos",
};

const publicoBadgeVariant: Record<CampaignPublico, "default" | "secondary" | "outline"> = {
  b2b: "default",
  comercial: "secondary",
  ambos: "outline",
};

function useClientesLite() {
  return useQuery({
    queryKey: ["clientes-lite-campanha"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, nome_fantasia")
        .order("nome", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function MultiSelectList<T extends { id: string }>({
  items, selected, onChange, getLabel, emptyMessage,
}: {
  items: T[];
  selected: string[];
  onChange: (ids: string[]) => void;
  getLabel: (item: T) => string;
  emptyMessage: string;
}) {
  if (!items.length) return <div className="text-xs text-muted-foreground py-2">{emptyMessage}</div>;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };
  return (
    <ScrollArea className="h-40 rounded-md border">
      <div className="p-2 space-y-1">
        {items.map((it) => (
          <label key={it.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted/50 cursor-pointer">
            <Checkbox checked={selected.includes(it.id)} onCheckedChange={() => toggle(it.id)} />
            <span className="flex-1 truncate">{getLabel(it)}</span>
          </label>
        ))}
      </div>
    </ScrollArea>
  );
}

export default function CampanhasComerciais() {
  const { data: campaigns = [], isLoading } = useCommercialCampaigns();
  const save = useSaveCampaign();
  const del = useDeleteCampaign();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    nome: "", descricao: "", data_inicio: "", data_fim: "", ativa: true, tipo_publico: "b2b",
  });

  // Listas para vincular
  const { data: parceirosData } = useParceirosB2B({ status: "ativos", page: 1, pageSize: 500 });
  const parceiros = parceirosData?.items ?? [];
  const { data: clientes = [] } = useClientesLite();

  // Vínculos atuais
  const { data: linkedPartners = [] } = useCampaignPartners(form.id);
  const { data: linkedClientes = [] } = useCampaignClientes(form.id);
  const setPartners = useSetCampaignPartners();
  const setClientes = useSetCampaignClientes();

  const [partnerSel, setPartnerSel] = useState<string[]>([]);
  const [clienteSel, setClienteSel] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; nome: string } | null>(null);

  useEffect(() => { setPartnerSel(linkedPartners); }, [linkedPartners]);
  useEffect(() => { setClienteSel(linkedClientes); }, [linkedClientes]);

  const handleNew = () => {
    setForm({ nome: "", descricao: "", data_inicio: "", data_fim: "", ativa: true, tipo_publico: "b2b" });
    setPartnerSel([]); setClienteSel([]);
    setFormError(null);
    setOpen(true);
  };

  const handleEdit = (c: any) => {
    setForm({ ...c });
    setFormError(null);
    setOpen(true);
  };

  const handleSave = async () => {
    const nome = String(form.nome ?? "").trim();
    const inicio = String(form.data_inicio ?? "").trim();
    const fim = String(form.data_fim ?? "").trim();

    if (!nome || !inicio || !fim) {
      setFormError("Preencha nome, data de início e data de fim.");
      return;
    }
    if (fim < inicio) {
      setFormError("A data de fim deve ser igual ou posterior à data de início.");
      return;
    }
    setFormError(null);

    const payload = { ...form, nome, data_inicio: inicio, data_fim: fim };
    try {
      await save.mutateAsync(payload);
      if (form.id) {
        const wantB2b = form.tipo_publico === "b2b" || form.tipo_publico === "ambos";
        const wantCom = form.tipo_publico === "comercial" || form.tipo_publico === "ambos";
        await setPartners.mutateAsync({ campaign_id: form.id, partner_ids: wantB2b ? partnerSel : [] });
        await setClientes.mutateAsync({ campaign_id: form.id, cliente_ids: wantCom ? clienteSel : [] });
      }
      setOpen(false);
    } catch (e: any) {
      setFormError(e?.message ? `Não foi possível salvar: ${e.message}` : "Não foi possível salvar a campanha. Tente novamente.");
    }
  };

  const nomeTrim = String(form.nome ?? "").trim();
  const inicioVal = String(form.data_inicio ?? "").trim();
  const fimVal = String(form.data_fim ?? "").trim();
  const formValido = !!nomeTrim && !!inicioVal && !!fimVal && fimVal >= inicioVal;
  const salvando = save.isPending || setPartners.isPending || setClientes.isPending;

  const tipo = (form.tipo_publico ?? "b2b") as CampaignPublico;
  const showB2b = tipo === "b2b" || tipo === "ambos";
  const showCom = tipo === "comercial" || tipo === "ambos";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campanhas Comerciais</h1>
          <p className="text-sm text-muted-foreground">
            Ações comerciais com vigência direcionadas a parceiros B2B e/ou clientes do time comercial.
          </p>
        </div>
        <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" /> Nova campanha</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lista</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-sm text-muted-foreground">Carregando...</div>
            : campaigns.length === 0 ? <div className="text-sm text-muted-foreground text-center py-6">Nenhuma campanha cadastrada.</div>
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Público</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const tp = (c.tipo_publico ?? "b2b") as CampaignPublico;
                    return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => handleEdit(c)}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell>
                          <Badge variant={publicoBadgeVariant[tp]}>{publicoLabel[tp]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDateDisplay(c.data_inicio)} — {formatDateDisplay(c.data_fim)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.ativa ? "default" : "outline"}>{c.ativa ? "Ativa" : "Inativa"}</Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Excluir campanha ${c.nome}`}
                            onClick={() => setPendingDelete({ id: c.id, nome: c.nome })}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar campanha" : "Nova campanha"}</DialogTitle>
            <DialogDescription>
              Informe nome e vigência da campanha. A data de fim deve ser igual ou posterior à data de início.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {formError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
            <div>
              <Label htmlFor="campanha-nome" className="text-xs text-muted-foreground">Nome</Label>
              <Input id="campanha-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="campanha-descricao" className="text-xs text-muted-foreground">Descrição</Label>
              <Textarea id="campanha-descricao" rows={3} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="campanha-inicio" className="text-xs text-muted-foreground">Início</Label>
                <Input id="campanha-inicio" type="date" value={form.data_inicio ?? ""} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="campanha-fim" className="text-xs text-muted-foreground">Fim</Label>
                <Input id="campanha-fim" type="date" value={form.data_fim ?? ""} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="campanha-publico" className="text-xs text-muted-foreground">Público-alvo</Label>
              <Select
                value={tipo}
                onValueChange={(v: CampaignPublico) => setForm({ ...form, tipo_publico: v })}
              >
                <SelectTrigger id="campanha-publico"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="b2b">Parceiros B2B</SelectItem>
                  <SelectItem value="comercial">Clientes (Comercial)</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={!!form.ativa} onCheckedChange={(v) => setForm({ ...form, ativa: v })} />
              <span className="text-sm">Ativa</span>
            </div>

            {form.id && (
              <div className="space-y-3 pt-2 border-t">
                {showB2b && (
                  <div>
                    <div className="text-sm font-medium mb-1">Parceiros B2B vinculados</div>
                    <MultiSelectList
                      items={(parceiros as any[]).map((p) => ({ id: p.id, label: p.razao_social || p.nome_fantasia || p.codigo }))}
                      selected={partnerSel}
                      onChange={setPartnerSel}
                      getLabel={(it: any) => it.label}
                      emptyMessage="Nenhum parceiro ativo encontrado."
                    />
                  </div>
                )}
                {showCom && (
                  <div>
                    <div className="text-sm font-medium mb-1">Clientes vinculados</div>
                    <MultiSelectList
                      items={(clientes as any[]).map((c) => ({ id: c.id, label: c.nome_fantasia || c.nome }))}
                      selected={clienteSel}
                      onChange={setClienteSel}
                      getLabel={(it: any) => it.label}
                      emptyMessage="Nenhum cliente ativo encontrado."
                    />
                  </div>
                )}
              </div>
            )}
            {!form.id && (
              <div className="text-xs text-muted-foreground italic">
                Salve a campanha para vincular parceiros e/ou clientes.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!formValido || salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a campanha <strong>{pendingDelete?.nome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingDelete) del.mutate(pendingDelete.id); setPendingDelete(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
