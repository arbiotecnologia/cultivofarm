import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, History, Droplets, Wind, MoreHorizontal, Trash2, Archive, Pencil, Sprout, MapPin, Crosshair, Link2, ExternalLink } from "lucide-react";
import { getCurrentPosition, parseGoogleMapsUrl, getGoogleMapsUrl } from "@/lib/geo";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ExcluirInativarDialog } from "@/components/cadastros/ExcluirInativarDialog";
import { checkTalhaoDeps } from "@/lib/cadastros";
import { useAuth } from "@/hooks/useAuth";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";
import SafrasTalhaoDialog from "@/components/talhoes/SafrasTalhaoDialog";
import { canWrite } from "@/lib/permissions";

interface SafraAtual {
  id: string;
  safra: string;
  data_previsao_colheita: string | null;
  culturas?: { nome: string } | null;
}
interface Talhao {
  id: string;
  nome: string;
  fazenda_id: string;
  area_hectares: number | null;
  historico_pragas: string | null;
  observacoes: string | null;
  tipo_manejo_agua: string;
  ativo?: boolean;
  safra_atual_id: string | null;
  safra_atual?: SafraAtual | null;
  latitude?: number | null;
  longitude?: number | null;
  localizacao_referencia?: string | null;
}

interface Props {
  fazendaId: string;
}

const emptyForm = {
  id: "",
  nome: "",
  area_hectares: "",
  historico_pragas: "",
  observacoes: "",
  tipo_manejo_agua: "sequeiro",
  latitude: "",
  longitude: "",
  localizacao_referencia: "",
  mapsLink: "",
};

export default function TalhoesFazendaTab({ fazendaId }: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "administrador";
  const canManage = canWrite(role, "/talhoes");

  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [showInativos, setShowInativos] = useState(false);
  const [delDialog, setDelDialog] = useState<{ id: string; nome: string; inativo: boolean } | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [safrasOf, setSafrasOf] = useState<{ id: string; nome: string } | null>(null);

  const fetchData = async () => {
    const { data: t } = await supabase
      .from("talhoes")
      .select("*, safra_atual:safra_atual_id(id, safra, data_previsao_colheita, culturas(nome))")
      .eq("fazenda_id", fazendaId)
      .order("nome");
    if (t) setTalhoes(t as any);
  };

  useEffect(() => { if (fazendaId) fetchData(); }, [fazendaId]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setForm({ ...emptyForm });
  };

  const openEdit = (t: Talhao) => {
    setForm({
      id: t.id,
      nome: t.nome,
      area_hectares: t.area_hectares?.toString() || "",
      historico_pragas: t.historico_pragas || "",
      observacoes: t.observacoes || "",
      tipo_manejo_agua: t.tipo_manejo_agua || "sequeiro",
      latitude: t.latitude != null ? String(t.latitude) : "",
      longitude: t.longitude != null ? String(t.longitude) : "",
      localizacao_referencia: t.localizacao_referencia || "",
      mapsLink: "",
    });
    setOpen(true);
  };

  const [gpsLoading, setGpsLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nome: form.nome,
      fazenda_id: fazendaId,
      area_hectares: form.area_hectares ? Number(form.area_hectares) : null,
      historico_pragas: form.historico_pragas || null,
      observacoes: form.observacoes || null,
      tipo_manejo_agua: form.tipo_manejo_agua,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      localizacao_referencia: form.localizacao_referencia || null,
    };
    const { error } = form.id
      ? await supabase.from("talhoes").update(payload).eq("id", form.id)
      : await supabase.from("talhoes").insert([payload]);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Talhão atualizado!" : "Talhão cadastrado! Agora cadastre a safra atual.");
    handleOpenChange(false);
    fetchData();
  };

  const handleInativar = async (id: string, ativo: boolean) => {
    const { error } = await supabase.from("talhoes").update({ ativo }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(ativo ? "Talhão reativado" : "Talhão inativado");
    fetchData();
  };

  const handleExcluir = async (id: string) => {
    const { error } = await supabase.from("talhoes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Talhão excluído definitivamente");
    fetchData();
  };

  const filtered = talhoes.filter((t) => {
    const q = search.toLowerCase();
    const match =
      t.nome.toLowerCase().includes(q) ||
      t.tipo_manejo_agua.toLowerCase().includes(q) ||
      (t.safra_atual?.culturas as any)?.nome?.toLowerCase().includes(q) ||
      (t.safra_atual?.safra || "").toLowerCase().includes(q);
    const ativoOk = showInativos ? true : t.ativo !== false;
    return match && ativoOk;
  });

  const diasParaColheita = (d?: string | null) => {
    if (!d) return null;
    const ms = new Date(d + "T00:00:00").getTime() - Date.now();
    return Math.round(ms / 86400000);
  };

  const SafraBadge = ({ t }: { t: Talhao }) => {
    if (!t.safra_atual) return <Badge variant="outline" className="text-[10px]">Sem safra ativa</Badge>;
    const dias = diasParaColheita(t.safra_atual.data_previsao_colheita);
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Sprout className="h-2.5 w-2.5" /> {(t.safra_atual.culturas as any)?.nome || "—"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{t.safra_atual.safra}</span>
        </div>
        {dias !== null && (
          <span className={`text-[10px] font-medium ${dias < 0 ? "text-destructive" : dias < 15 ? "text-amber-600" : "text-muted-foreground"}`}>
            {dias < 0 ? `Atrasada ${Math.abs(dias)}d` : `Colheita em ${dias}d`}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage ? <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Novo Talhão</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{form.id ? "Editar Talhão" : "Novo Talhão"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="form-spacing-mobile pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:space-y-1">
                  <Label>Nome do Talhão *</Label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    autoCase="upper"
                    required
                    placeholder="Ex: TALHÃO 01"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-1">
                  <Label>Área (ha)</Label>
                  <Input type="number" step="0.01" value={form.area_hectares} onChange={(e) => setForm({ ...form, area_hectares: e.target.value })} placeholder="0,00" />
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-1">
                <Label>Manejo Hídrico *</Label>
                <Select value={form.tipo_manejo_agua} onValueChange={(v) => setForm({ ...form, tipo_manejo_agua: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequeiro">Sequeiro</SelectItem>
                    <SelectItem value="irrigado">Irrigado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:space-y-1">
                <Label>Histórico de Pragas e doenças</Label>
                <Textarea value={form.historico_pragas} onChange={(e) => setForm({ ...form, historico_pragas: e.target.value })} rows={2} placeholder="Opcional..." autoCase="title" />
              </div>
              <div className="space-y-1.5 sm:space-y-1">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} placeholder="Opcional..." autoCase="title" />
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <Label className="font-semibold">Localização do talhão</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Latitude</Label>
                    <Input type="number" step="0.0000001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="-23.5505" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Longitude</Label>
                    <Input type="number" step="0.0000001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="-46.6333" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Referência (opcional)</Label>
                  <Input value={form.localizacao_referencia} onChange={(e) => setForm({ ...form, localizacao_referencia: e.target.value })} placeholder="Ex: Portão norte, próximo ao silo..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Link2 className="h-3 w-3" /> Colar link do Google Maps</Label>
                  <Input
                    value={form.mapsLink}
                    onChange={(e) => {
                      const link = e.target.value;
                      const parsed = parseGoogleMapsUrl(link);
                      if (parsed) {
                        setForm({ ...form, mapsLink: link, latitude: String(parsed.lat), longitude: String(parsed.lng) });
                        toast.success("Coordenadas extraídas do link!");
                      } else {
                        setForm({ ...form, mapsLink: link });
                      }
                    }}
                    placeholder="https://maps.google.com/..."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={gpsLoading}
                    onClick={async () => {
                      setGpsLoading(true);
                      try {
                        const pos = await getCurrentPosition();
                        setForm({ ...form, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) });
                        toast.success(`GPS capturado (±${Math.round(pos.coords.accuracy)}m)`);
                      } catch (err: any) {
                        toast.error(err?.message || "Falha ao obter localização");
                      } finally {
                        setGpsLoading(false);
                      }
                    }}
                  >
                    <Crosshair className="h-3.5 w-3.5 mr-1" />
                    {gpsLoading ? "Capturando..." : "Usar minha localização atual"}
                  </Button>
                  {form.latitude && form.longitude && (
                    <a
                      href={getGoogleMapsUrl(Number(form.latitude), Number(form.longitude))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Ver no mapa
                    </a>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                💡 Cultura, safra e datas de plantio/colheita são gerenciados em <b>Safras</b> (botão <Sprout className="h-3 w-3 inline" /> em cada talhão).
              </p>
              <Button type="submit" className="w-full h-12 sm:h-10 mt-2 font-bold" disabled={!form.nome}>
                {form.id ? "Salvar Alterações" : "Salvar Talhão"}
              </Button>
            </form>
          </DialogContent>
        </Dialog> : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por talhão, cultura, safra ou manejo..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="th-fz-inativos" checked={showInativos} onCheckedChange={setShowInativos} />
              <label htmlFor="th-fz-inativos" className="text-xs text-muted-foreground cursor-pointer">Mostrar inativos</label>
            </div>
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "p-4" : ""}>
          <ResponsiveTable
            mobileCards={
              filtered.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Nenhum talhão cadastrado nesta fazenda</div>
              ) : (
                filtered.map((t) => (
                  <MobileCard
                    onClick={() => navigate(`/talhoes/${t.id}`)}
                    ariaLabel={`Abrir histórico de ${t.nome}`}
                    key={t.id}
                    title={t.nome}
                    subtitle={t.safra_atual ? `${(t.safra_atual.culturas as any)?.nome} • ${t.safra_atual.safra}` : "Sem safra ativa"}
                    status={
                      t.tipo_manejo_agua === 'irrigado' ? (
                        <Badge variant="default" className="bg-blue-600 h-5 px-1.5 text-[10px] gap-1">
                          <Droplets className="h-2.5 w-2.5" /> Irrigado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-1">
                          <Wind className="h-2.5 w-2.5" /> Sequeiro
                        </Badge>
                      )
                    }
                    content={[
                      { label: "Área", value: t.area_hectares ? `${t.area_hectares.toLocaleString("pt-BR")} ha` : "—" },
                    ]}
                    actions={
                      <div className="w-full flex gap-2" onClick={stopRowClick}>
                        {canManage ? <Button className="flex-1" size="sm" variant="outline" onClick={() => setSafrasOf({ id: t.id, nome: t.nome })}>
                          <Sprout className="h-4 w-4 mr-1" /> Safras
                        </Button> : null}
                        {canManage ? <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button> : null}
                      </div>
                    }
                  />
                ))
              )
            }
          >
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Talhão</TableHead>
                    <TableHead>Área (ha)</TableHead>
                    <TableHead>Safra atual</TableHead>
                    <TableHead>Manejo</TableHead>
                    <TableHead className="w-[180px] text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum talhão cadastrado nesta fazenda</TableCell></TableRow>
                  ) : (
                    filtered.map((t) => (
                      <TableRow key={t.id} {...rowClickProps(() => navigate(`/talhoes/${t.id}`))} className={`${t.ativo === false ? "opacity-60 " : ""}cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
                        <TableCell className="font-semibold">
                          <div className="flex items-center gap-2">
                            {t.nome}
                            {t.ativo === false && <Badge variant="secondary" className="text-[9px] h-4 px-1">Inativo</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono-data text-sm">{t.area_hectares?.toLocaleString("pt-BR") || "—"}</TableCell>
                        <TableCell><SafraBadge t={t} /></TableCell>
                        <TableCell>
                          {t.tipo_manejo_agua === 'irrigado' ? (
                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 gap-1">
                              <Droplets className="h-3 w-3" /> Irrigado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Wind className="h-3 w-3" /> Sequeiro
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center" onClick={stopRowClick}>
                          <div className="flex items-center justify-center gap-1">
                            {canManage ? <Button variant="ghost" size="icon" onClick={() => setSafrasOf({ id: t.id, nome: t.nome })} title="Gerenciar safras">
                              <Sprout className="h-4 w-4 text-emerald-600" />
                            </Button> : null}
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/talhoes/${t.id}`)} title="Histórico unificado">
                              <History className="h-4 w-4" />
                            </Button>
                            {canManage ? <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Editar talhão">
                              <Pencil className="h-4 w-4" />
                            </Button> : null}
                            {canManage ? <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="text-destructive" onClick={() => setDelDialog({ id: t.id, nome: t.nome, inativo: t.ativo === false })}>
                                  {t.ativo === false ? <><Archive className="h-4 w-4 mr-2" /> Reativar / Excluir</> : <><Trash2 className="h-4 w-4 mr-2" /> Inativar / Excluir</>}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ResponsiveTable>
        </CardContent>
      </Card>

      {canManage && safrasOf && (
        <SafrasTalhaoDialog
          talhaoId={safrasOf.id}
          talhaoNome={safrasOf.nome}
          open={!!safrasOf}
          onOpenChange={(v) => !v && setSafrasOf(null)}
          onChanged={fetchData}
        />
      )}

      {canManage && delDialog && (
        <ExcluirInativarDialog
          open={!!delDialog}
          onOpenChange={(v) => !v && setDelDialog(null)}
          nome={delDialog.nome}
          entidade="talhão"
          entidadeId={delDialog.id}
          isAdmin={isAdmin}
          jaInativo={delDialog.inativo}
          loadDeps={() => checkTalhaoDeps(delDialog.id)}
          onInativar={() => handleInativar(delDialog.id, false)}
          onReativar={() => handleInativar(delDialog.id, true)}
          onExcluir={() => handleExcluir(delDialog.id)}
        />
      )}
    </div>
  );
}
