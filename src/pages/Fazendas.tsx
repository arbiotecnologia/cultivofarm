import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MapPin, User, FileText, Navigation, Link as LinkIcon, Loader2, Compass, Copy, Share2, Map as MapIcon, Pencil, MoreHorizontal, Archive, Trash2, Phone, Map as MapIcon2 } from "lucide-react";
import { toast } from "sonner";
import { formatTelefone } from "@/lib/masks";
import { useSearchParams } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { unmask, validatePhoneBR } from "@/lib/masks";
import { getCurrentPosition, parseGoogleMapsUrl, getGoogleMapsUrl, getWazeUrl, getPublicMapEmbedUrl } from "@/lib/geo";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExcluirInativarDialog } from "@/components/cadastros/ExcluirInativarDialog";
import { checkFazendaDeps } from "@/lib/cadastros";
import { useAuth } from "@/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";
import { getClienteLabel } from "@/lib/clienteLabel";
import { canWrite } from "@/lib/permissions";


interface Cliente { id: string; nome: string; nome_fantasia?: string; codigo_cliente?: string; }
interface Consultor { user_id: string; nome: string; }
interface Fazenda {
  id: string;
  nome: string;
  cliente_id: string;
  codigo_referencia: string | null;
  consultor_responsavel_id: string | null;
  municipio: string | null;
  estado: string | null;
  area_total: number | null;
  area_produtiva: number | null;
  latitude: number | null;
  longitude: number | null;
  tipo_exploracao: string | null;
  inscricao_estadual_produtor: string | null;
  car: string | null;
  nirf: string | null;
  endereco_acesso: string | null;
  ponto_referencia: string | null;
  responsavel_local_nome: string | null;
  responsavel_local_telefone: string | null;
  distancia_sede_km: number | null;
  ativo?: boolean;
  clientes?: { nome: string; nome_fantasia?: string; codigo_cliente?: string } | null;
  profiles?: { nome: string } | null;
}

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

export default function Fazendas() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "administrador";
  const canManage = canWrite(role, "/fazendas");
  const [searchParams] = useSearchParams();
  const clienteFilter = searchParams.get("cliente");
  const [showInativos, setShowInativos] = useState(false);
  const [delDialog, setDelDialog] = useState<{ id: string; nome: string; inativo: boolean } | null>(null);

  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loadingGps, setLoadingGps] = useState(false);
  const [mapsUrl, setMapsUrl] = useState("");
  const initialForm: Partial<Fazenda> = {
    nome: "",
    cliente_id: clienteFilter || "",
    municipio: "",
    estado: "",
    codigo_referencia: "",
    tipo_exploracao: "",
    consultor_responsavel_id: "",
    latitude: null,
    longitude: null,
  };
  const [form, setForm] = useState<Partial<Fazenda>>(initialForm);

  const openEdit = (f: Fazenda) => {
    const { clientes, profiles, ...rest } = f as any;
    setForm(rest);
    setOpen(true);
  };

  const handleDialogOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setForm({ ...initialForm, cliente_id: clienteFilter || "" });
  };

  const handleGetCurrentLocation = async () => {
    setLoadingGps(true);
    try {
      const pos = await getCurrentPosition();
      setForm(prev => ({
        ...prev,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      }));
      toast.success("Coordenadas capturadas com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao obter localização: " + err.message);
    } finally {
      setLoadingGps(false);
    }
  };

  const handleParseMapsUrl = () => {
    if (!mapsUrl) return;
    const coords = parseGoogleMapsUrl(mapsUrl);
    if (coords) {
      setForm(prev => ({
        ...prev,
        latitude: coords.lat,
        longitude: coords.lng
      }));
      setMapsUrl("");
      toast.success("Coordenadas extraídas da URL!");
    } else {
      toast.error("Não foi possível identificar as coordenadas nesta URL.");
    }
  };

  const handleCopyLocation = (lat?: number | null, lng?: number | null, label?: string) => {
    if (!lat || !lng) return;
    const url = getGoogleMapsUrl(lat, lng);
    navigator.clipboard.writeText(url);
    toast.success(`${label || "Localização"} copiada para a área de transferência!`);
  };

  const fetchData = async () => {
    const [fRes, cRes, rolesRes] = await Promise.all([
      supabase.from("fazendas").select("*, clientes(nome, nome_fantasia, codigo_cliente), profiles:consultor_responsavel_id(nome)").order("nome").limit(500),
      supabase.from("clientes").select("id, nome, nome_fantasia, codigo_cliente").order("nome"),
      supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["consultor_tecnico", "tecnico_agronomo"]),
    ]);

    if (fRes.data) setFazendas(fRes.data as any);
    if (cRes.data) setClientes(cRes.data as any);

    const userIds = Array.from(new Set((rolesRes.data || []).map((r: any) => r.user_id).filter(Boolean)));
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, nome, ativo")
        .in("user_id", userIds);
      const mapped = (profs || [])
        .filter((p: any) => p.ativo !== false && p.nome)
        .map((p: any) => ({ user_id: p.user_id, nome: p.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      setConsultores(mapped as any);
    } else {
      setConsultores([]);
    }
  };

  useEffect(() => { 
    fetchData(); 
    if (clienteFilter) setForm(prev => ({ ...prev, cliente_id: clienteFilter }));
  }, [clienteFilter]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const { id, ...dataToInsert } = form;
    const isEdit = !!id;

    const faltando: string[] = [];
    if (!dataToInsert.cliente_id) faltando.push("Cliente");
    if (!dataToInsert.nome?.trim()) faltando.push("Nome da fazenda");
    if (faltando.length) {
      toast.error(`Preencha: ${faltando.join(", ")}`);
      return;
    }

    const uuidOrNull = (v: any) => (v && String(v).trim() !== "" ? v : null);

    const payload: any = {
      ...dataToInsert,
      consultor_responsavel_id: uuidOrNull(dataToInsert.consultor_responsavel_id),
      area_total: dataToInsert.area_total ? Number(dataToInsert.area_total) : null,
      area_produtiva: dataToInsert.area_produtiva ? Number(dataToInsert.area_produtiva) : null,
      latitude: dataToInsert.latitude ? Number(dataToInsert.latitude) : null,
      longitude: dataToInsert.longitude ? Number(dataToInsert.longitude) : null,
      distancia_sede_km: dataToInsert.distancia_sede_km ? Number(dataToInsert.distancia_sede_km) : null,
      responsavel_local_telefone: (() => { const c = validatePhoneBR(dataToInsert.responsavel_local_telefone, { fieldLabel: "Telefone do responsável local" }); if (!c.ok) throw new Error(c.error); return c.value; })(),
      inscricao_estadual_produtor: unmask(dataToInsert.inscricao_estadual_produtor),
    };

    delete payload.clientes;
    delete payload.profiles;

    const { error } = isEdit
      ? await supabase.from("fazendas").update(payload).eq("id", id as string)
      : await supabase.from("fazendas").insert([payload]);

    if (error) {
      console.error("Erro ao salvar fazenda:", error);
      const msg = /invalid input syntax for type uuid/i.test(error.message)
        ? "Há um campo de seleção (Cliente ou Consultor) sem valor válido. Verifique e tente novamente."
        : /violates not-null/i.test(error.message)
          ? "Há campos obrigatórios não preenchidos. Revise o formulário."
          : error.message;
      toast.error(msg);
      return;
    }
    toast.success(isEdit ? "Fazenda atualizada!" : "Fazenda cadastrada!");
    handleDialogOpenChange(false);
    fetchData();
  };

  const handleInativarFazenda = async (id: string, ativo: boolean) => {
    const { error } = await supabase.from("fazendas").update({ ativo }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(ativo ? "Fazenda reativada" : "Fazenda inativada");
    fetchData();
  };

  const handleExcluirFazenda = async (id: string) => {
    const { error } = await supabase.from("fazendas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Fazenda excluída definitivamente");
    fetchData();
  };

  const filtered = fazendas.filter((f) => {
    const q = search.toLowerCase();
    const cleanQ = unmask(q);
    const matchesSearch = f.nome.toLowerCase().includes(q) ||
      f.municipio?.toLowerCase().includes(q) ||
      f.codigo_referencia?.toLowerCase().includes(q) ||
      (f.clientes?.nome_fantasia || f.clientes?.nome || "").toLowerCase().includes(q) ||
      (f.clientes?.codigo_cliente || "").includes(cleanQ);

    const matchesCliente = clienteFilter ? f.cliente_id === clienteFilter : true;
    const matchesAtivo = showInativos ? true : f.ativo !== false;

    return matchesSearch && matchesCliente && matchesAtivo;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Fazendas"
        description="Propriedades rurais e consultores responsáveis"
        action={
          canManage ? <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Nova Fazenda</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
              <DialogHeader><DialogTitle>{form.id ? "Editar Propriedade Rural" : "Cadastrar Propriedade Rural"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="form-spacing-mobile pt-2">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Identificação</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:space-y-1">
                      <Label>Cliente *</Label>
                      <Select value={form.cliente_id} onValueChange={(v) => setForm({...form, cliente_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                        <SelectContent>
                          {clientes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{getClienteLabel(c)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:space-y-1">
                      <Label>Nome da Fazenda *</Label>
                      <Input value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} required />
                    </div>
                    <div className="space-y-1.5 sm:space-y-1">
                      <Label>Código de Referência (Apelido)</Label>
                      <Input value={form.codigo_referencia || ""} onChange={(e) => setForm({...form, codigo_referencia: e.target.value})} placeholder="Ex: Sede, Talhão Sul" />
                    </div>
                    <div className="space-y-1.5 sm:space-y-1">
                      <Label>Tipo de Exploração</Label>
                      <Input value={form.tipo_exploracao || ""} onChange={(e) => setForm({...form, tipo_exploracao: e.target.value})} placeholder="Ex: Soja, Milho, Pecuária" />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Localização e Acesso</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:space-y-1"><Label>Município</Label><Input value={form.municipio || ""} onChange={(e) => setForm({...form, municipio: e.target.value})} autoCase="title" /></div>
                    <div className="space-y-1.5 sm:space-y-1">
                      <Label>Estado</Label>
                      <Select value={form.estado || ""} onValueChange={(v) => setForm({...form, estado: v})}>
                        <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                        <SelectContent>{ESTADOS_BR.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:space-y-1 col-span-2"><Label>Endereço de Acesso / Como Chegar</Label><Input value={form.endereco_acesso || ""} onChange={(e) => setForm({...form, endereco_acesso: e.target.value})} autoCase="title" /></div>
                    <div className="space-y-1.5 sm:space-y-1"><Label>Ponto de Referência</Label><Input value={form.ponto_referencia || ""} onChange={(e) => setForm({...form, ponto_referencia: e.target.value})} autoCase="title" /></div>
                    <div className="space-y-1.5 sm:space-y-1"><Label>Distância da Sede/Cidade (km)</Label><Input type="number" value={form.distancia_sede_km || ""} onChange={(e) => setForm({...form, distancia_sede_km: Number(e.target.value)})} /></div>
                  </div>

                  <div className="bg-muted/30 p-4 rounded-lg border space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium flex items-center gap-2 text-primary">
                        <Compass className="h-4 w-4" /> Coordenadas GPS
                      </h4>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={handleGetCurrentLocation}
                        disabled={loadingGps}
                        className="h-8 text-xs"
                      >
                        {loadingGps ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Navigation className="h-3 w-3 mr-1" />
                        )}
                        Usar Minha Localização
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5 sm:space-y-1">
                        <Label className="text-xs">Latitude</Label>
                        <Input 
                          type="number" 
                          step="0.0000001"
                          value={form.latitude ?? ""} 
                          onChange={(e) => setForm({...form, latitude: e.target.value ? Number(e.target.value) : null})}
                          placeholder="Ex: -23.5505"
                        />
                      </div>
                      <div className="space-y-1.5 sm:space-y-1">
                        <Label className="text-xs">Longitude</Label>
                        <Input 
                          type="number" 
                          step="0.0000001"
                          value={form.longitude ?? ""} 
                          onChange={(e) => setForm({...form, longitude: e.target.value ? Number(e.target.value) : null})}
                          placeholder="Ex: -46.6333"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:space-y-1">
                      <Label className="text-xs">Colar Link do Google Maps</Label>
                      <div className="flex gap-2">
                        <Input 
                          value={mapsUrl} 
                          onChange={(e) => setMapsUrl(e.target.value)} 
                          placeholder="Cole a URL para extrair as coordenadas..."
                          className="text-xs"
                        />
                        <Button type="button" size="icon" variant="secondary" onClick={handleParseMapsUrl} disabled={!mapsUrl}>
                          <LinkIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {form.latitude && form.longitude && (
                      <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" asChild className="h-7 text-[10px] bg-white px-2">
                            <a href={getGoogleMapsUrl(form.latitude, form.longitude)} target="_blank" rel="noreferrer">
                              Abrir no Google Maps
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild className="h-7 text-[10px] bg-white px-2">
                            <a href={getWazeUrl(form.latitude, form.longitude)} target="_blank" rel="noreferrer">
                              Abrir no Waze
                            </a>
                          </Button>
                          <Button 
                            type="button"
                            variant="secondary" 
                            size="sm" 
                            className="h-7 text-[10px] px-2"
                            onClick={() => handleCopyLocation(form.latitude, form.longitude, "Link do Google Maps")}
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copiar Link
                          </Button>
                        </div>
                        
                        <div className="relative w-full h-40 rounded-md overflow-hidden border bg-muted shadow-sm">
                          <iframe
                            title="Mapa da Fazenda"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            loading="lazy"
                            allowFullScreen
                            referrerPolicy="no-referrer-when-downgrade"
                            src={getPublicMapEmbedUrl(form.latitude, form.longitude)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Responsáveis</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:space-y-1">
                      <Label>Consultor Técnico Responsável</Label>
                      <Select value={form.consultor_responsavel_id || ""} onValueChange={(v) => setForm({...form, consultor_responsavel_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Selecione o consultor" /></SelectTrigger>
                        <SelectContent>
                          {consultores.map((c) => (
                            <SelectItem key={c.user_id} value={c.user_id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                     <div className="space-y-1.5 sm:space-y-1"><Label>Responsável Local (Gerente)</Label><Input value={form.responsavel_local_nome || ""} onChange={(e) => setForm({...form, responsavel_local_nome: e.target.value})} autoCase="title" /></div>
                     <div className="space-y-1.5 sm:space-y-1">
                       <Label>Telefone Responsável Local</Label>
                       <MaskedInput mask="telefone" value={form.responsavel_local_telefone || ""} onChange={(e) => setForm({...form, responsavel_local_telefone: e.target.value})} />
                     </div>
                  </div>
                </div>

                <Button type="submit" className="w-full h-12 sm:h-10 font-bold" disabled={!form.cliente_id || !form.nome}>{form.id ? "Atualizar Propriedade" : "Salvar Propriedade"}</Button>
              </form>
            </DialogContent>
          </Dialog> : null
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input placeholder="Buscar por nome, código, município ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fz-inativos" checked={showInativos} onCheckedChange={setShowInativos} />
              <label htmlFor="fz-inativos" className="text-xs text-muted-foreground cursor-pointer">Mostrar inativos</label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 bg-transparent border-none shadow-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-12 bg-white rounded-xl border border-dashed">
                Nenhuma fazenda encontrada
              </div>
            ) : (
              filtered.map((f) => (
                <div 
                  key={f.id}
                  onClick={() => navigate(`/fazendas/${f.id}`)}
                  className="group relative bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col"
                >
                  {/* Header Section */}
                  <div className="p-4 border-b border-slate-100">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 leading-tight group-hover:text-primary transition-colors min-w-0 flex-1 line-clamp-2">
                            {f.nome}
                          </h3>
                          {f.codigo_referencia && (
                            <Badge variant="secondary" className="text-[10px] font-medium h-5 px-1.5 uppercase tracking-wider shrink-0">
                              {f.codigo_referencia}
                            </Badge>
                          )}
                          {f.ativo === false && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1 shrink-0">Inativo</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 font-medium">
                          {getClienteLabel(f.clientes)}
                        </p>
                      </div>

                      {canManage ? <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-600">
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(f)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/fazendas/${f.id}?tab=talhoes`)}>
                            <MapPin className="h-4 w-4 mr-2" /> Ver talhões
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDelDialog({ id: f.id, nome: f.nome, inativo: f.ativo === false })}>
                            {f.ativo === false ? <><Archive className="h-4 w-4 mr-2" /> Reativar / Excluir</> : <><Trash2 className="h-4 w-4 mr-2" /> Inativar / Excluir</>}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu> : null}
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="p-4 space-y-3 flex-1">
                    {/* Location */}
                    <div className="flex items-start gap-2.5">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Localização</p>
                        <p className="text-sm text-slate-700 font-medium">
                          {f.municipio ? `${f.municipio} / ${f.estado}` : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Responsible */}
                    <div className="flex items-start gap-2.5">
                      <User className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Responsável Local</p>
                        <p className="text-sm text-slate-700 font-medium flex flex-wrap items-center gap-x-1.5">
                          <span>{f.responsavel_local_nome || "—"}</span>
                          {f.responsavel_local_telefone && (
                            <span className="text-slate-500 font-normal">
                              • {formatTelefone(f.responsavel_local_telefone)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Consultant */}
                    <div className="flex items-start gap-2.5">
                      <User className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Consultor</p>
                        <p className="text-sm text-slate-700 font-medium">
                          {f.profiles?.nome || "—"}
                        </p>
                      </div>
                    </div>

                    {/* Areas */}
                    <div className="grid grid-cols-2 gap-px bg-slate-200 rounded-lg overflow-hidden mt-2 border border-slate-200">
                      <div className="bg-slate-50 p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Área Total</p>
                        <p className="text-sm font-bold text-slate-800">
                          {f.area_total || "0"} <span className="text-[10px] font-normal text-slate-500">ha</span>
                        </p>
                      </div>
                      <div className="bg-slate-50 p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">Produtiva</p>
                        <p className="text-sm font-bold text-emerald-700">
                          {f.area_produtiva || "0"} <span className="text-[10px] font-normal text-emerald-600">ha</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex gap-2">
                    {f.latitude && f.longitude ? (
                      <Button 
                        asChild 
                        className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a href={getGoogleMapsUrl(f.latitude, f.longitude)} target="_blank" rel="noreferrer">
                          <Navigation className="h-3.5 w-3.5 mr-1.5" />
                          Como chegar
                        </a>
                      </Button>
                    ) : (
                      <div className="flex-1" />
                    )}
                    {canManage ? <Button 
                      variant="outline" 
                      className="px-4 h-9 border-slate-200 hover:bg-white text-slate-600 rounded-lg text-xs font-bold transition-all shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(f);
                      }}
                    >
                      Editar
                    </Button> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {canManage && delDialog && (
        <ExcluirInativarDialog
          open={!!delDialog}
          onOpenChange={(v) => !v && setDelDialog(null)}
          nome={delDialog.nome}
          entidade="fazenda"
          entidadeId={delDialog.id}
          isAdmin={isAdmin}
          jaInativo={delDialog.inativo}
          loadDeps={() => checkFazendaDeps(delDialog.id)}
          onInativar={() => handleInativarFazenda(delDialog.id, false)}
          onReativar={() => handleInativarFazenda(delDialog.id, true)}
          onExcluir={() => handleExcluirFazenda(delDialog.id)}
        />
      )}
    </div>
  );
}
