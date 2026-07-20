import { formatDateDisplay } from "@/lib/date-utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle2, Sprout, Calendar, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Cultura { id: string; nome: string }
interface Safra {
  id: string;
  talhao_id: string;
  cultura_id: string;
  safra: string;
  periodo_safra: string | null;
  data_plantio: string;
  data_previsao_colheita: string | null;
  data_colheita_real: string | null;
  produtividade: number | null;
  unidade_produtividade: string | null;
  status: string;
  observacoes: string | null;
  culturas?: { nome: string } | null;
}

interface Props {
  talhaoId: string;
  talhaoNome: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}

const PERIODOS = [
  { value: "verao", label: "Verão" },
  { value: "safrinha", label: "Safrinha" },
  { value: "inverno", label: "Inverno" },
  { value: "perene", label: "Perene" },
  { value: "entressafra", label: "Entressafra" },
];

const UNIDADES = ["sc/ha", "t/ha", "kg/ha", "@/ha"];

const emptyNova = {
  cultura_id: "",
  safra: "",
  periodo_safra: "verao",
  data_plantio: "",
  data_previsao_colheita: "",
};

const emptyEncerrar = {
  data_colheita_real: new Date().toISOString().slice(0, 10),
  produtividade: "",
  unidade_produtividade: "sc/ha",
  observacoes: "",
};

export default function SafrasTalhaoDialog({ talhaoId, talhaoNome, open, onOpenChange, onChanged }: Props) {
  const { role } = useAuth();
  const isAdmin = role === "administrador";
  const [safras, setSafras] = useState<Safra[]>([]);
  const [culturas, setCulturas] = useState<Cultura[]>([]);
  const [loading, setLoading] = useState(false);

  const [novaOpen, setNovaOpen] = useState(false);
  const [nova, setNova] = useState({ ...emptyNova });

  const [encerrarSafra, setEncerrarSafra] = useState<Safra | null>(null);
  const [encerrar, setEncerrar] = useState({ ...emptyEncerrar });

  const fetchData = async () => {
    if (!talhaoId) return;
    setLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("talhao_safras").select("*, culturas(nome)").eq("talhao_id", talhaoId).order("data_plantio", { ascending: false }),
      supabase.from("culturas").select("id, nome").order("nome"),
    ]);
    if (s) setSafras(s as any);
    if (c) setCulturas(c as Cultura[]);
    setLoading(false);
  };

  useEffect(() => { if (open) fetchData(); }, [open, talhaoId]);

  const atual = safras.find((s) => s.status === "em_andamento");
  const historico = safras.filter((s) => s.status !== "em_andamento");

  const handleNovaSafra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nova.cultura_id || !nova.safra || !nova.data_plantio) {
      toast.error("Preencha cultura, safra e data de plantio");
      return;
    }
    if (atual) {
      toast.error("Já existe uma safra em andamento. Encerre-a antes de iniciar outra.");
      return;
    }
    const { error } = await supabase.from("talhao_safras").insert([{
      talhao_id: talhaoId,
      cultura_id: nova.cultura_id,
      safra: nova.safra,
      periodo_safra: nova.periodo_safra || null,
      data_plantio: nova.data_plantio,
      data_previsao_colheita: nova.data_previsao_colheita || null,
      status: "em_andamento",
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success("Nova safra iniciada!");
    setNovaOpen(false);
    setNova({ ...emptyNova });
    fetchData();
    onChanged?.();
  };

  const handleEncerrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encerrarSafra) return;
    const { error } = await supabase.from("talhao_safras").update({
      status: "colhida",
      data_colheita_real: encerrar.data_colheita_real,
      produtividade: encerrar.produtividade ? Number(encerrar.produtividade) : null,
      unidade_produtividade: encerrar.unidade_produtividade,
      observacoes: encerrar.observacoes || null,
    }).eq("id", encerrarSafra.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Safra encerrada e movida para o histórico");
    setEncerrarSafra(null);
    setEncerrar({ ...emptyEncerrar });
    fetchData();
    onChanged?.();
  };

  const handleExcluir = async (id: string) => {
    if (!confirm("Excluir este registro de safra? Esta ação é permanente.")) return;
    const { error } = await supabase.from("talhao_safras").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Safra removida");
    fetchData();
    onChanged?.();
  };

  const fmtDate = (d: string | null) => formatDateDisplay(d ? d + "T00:00:00" : null) || "—";
  const periodoLabel = (p: string | null) => PERIODOS.find((x) => x.value === p)?.label || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-emerald-600" /> Safras • {talhaoNome}
          </DialogTitle>
        </DialogHeader>

        {/* Safra atual */}
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Safra atual
              </h3>
              {!atual && (
                <Button size="sm" onClick={() => setNovaOpen(true)} disabled={novaOpen}>
                  <Plus className="h-4 w-4 mr-1" /> Iniciar safra
                </Button>
              )}
            </div>
            {atual ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{(atual.culturas as any)?.nome || "—"}</span>
                  <Badge variant="secondary">{atual.safra}</Badge>
                  <Badge variant="outline">{periodoLabel(atual.periodo_safra)}</Badge>
                </div>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span><Calendar className="h-3 w-3 inline mr-1" /> Plantio: <b>{fmtDate(atual.data_plantio)}</b></span>
                  <span>Previsão colheita: <b>{fmtDate(atual.data_previsao_colheita)}</b></span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEncerrarSafra(atual)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Encerrar safra (registrar colheita)
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma safra em andamento neste talhão.</p>
            )}
          </CardContent>
        </Card>

        {/* Form nova safra */}
        {novaOpen && (
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <form onSubmit={handleNovaSafra} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Iniciar nova safra</h4>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setNovaOpen(false); setNova({ ...emptyNova }); }}>Cancelar</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Cultura *</Label>
                    <Select value={nova.cultura_id} onValueChange={(v) => setNova({ ...nova, cultura_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {culturas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Safra *</Label>
                    <Input value={nova.safra} onChange={(e) => setNova({ ...nova, safra: e.target.value })} placeholder="Ex: 2025/2026" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Período</Label>
                    <Select value={nova.periodo_safra} onValueChange={(v) => setNova({ ...nova, periodo_safra: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PERIODOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div />
                  <div className="space-y-1">
                    <Label className="text-xs">Data de plantio *</Label>
                    <Input type="date" value={nova.data_plantio} onChange={(e) => setNova({ ...nova, data_plantio: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Previsão de colheita</Label>
                    <Input type="date" value={nova.data_previsao_colheita} onChange={(e) => setNova({ ...nova, data_previsao_colheita: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full">Salvar safra</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Form encerrar */}
        {encerrarSafra && (
          <Card className="border-amber-300">
            <CardContent className="p-4">
              <form onSubmit={handleEncerrar} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Encerrar safra — {(encerrarSafra.culturas as any)?.nome} ({encerrarSafra.safra})</h4>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setEncerrarSafra(null); setEncerrar({ ...emptyEncerrar }); }}>Cancelar</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Data de colheita *</Label>
                    <Input type="date" required value={encerrar.data_colheita_real} onChange={(e) => setEncerrar({ ...encerrar, data_colheita_real: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Produtividade</Label>
                    <Input type="number" step="0.01" value={encerrar.produtividade} onChange={(e) => setEncerrar({ ...encerrar, produtividade: e.target.value })} placeholder="Ex: 65" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unidade</Label>
                    <Select value={encerrar.unidade_produtividade} onValueChange={(v) => setEncerrar({ ...encerrar, unidade_produtividade: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Textarea rows={2} value={encerrar.observacoes} onChange={(e) => setEncerrar({ ...encerrar, observacoes: e.target.value })} placeholder="Ex: perdas, intercorrências, qualidade..." />
                </div>
                <Button type="submit" className="w-full">Confirmar colheita</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Histórico */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <History className="h-4 w-4" /> Histórico de rotação
              <Badge variant="secondary" className="ml-1">{historico.length}</Badge>
            </h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem safras encerradas registradas ainda.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Safra</TableHead>
                      <TableHead>Cultura</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Plantio</TableHead>
                      <TableHead>Colheita</TableHead>
                      <TableHead>Produtividade</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.safra}</TableCell>
                        <TableCell>{(s.culturas as any)?.nome || "—"}</TableCell>
                        <TableCell>{periodoLabel(s.periodo_safra)}</TableCell>
                        <TableCell>{fmtDate(s.data_plantio)}</TableCell>
                        <TableCell>{fmtDate(s.data_colheita_real)}</TableCell>
                        <TableCell className="font-mono-data text-sm">
                          {s.produtividade ? `${s.produtividade} ${s.unidade_produtividade || ""}` : "—"}
                        </TableCell>
                        <TableCell>
                          {s.status === "colhida" ? (
                            <Badge className="bg-emerald-600">Colhida</Badge>
                          ) : (
                            <Badge variant="destructive">Cancelada</Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleExcluir(s.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
