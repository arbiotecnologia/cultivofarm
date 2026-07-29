import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabParam } from "@/lib/navigation/useTabParam";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil as PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";

import { ProdutosTab } from "@/components/protocolos/ProdutosTab";
import { CatalogoTecnicoTab } from "@/components/protocolos/CatalogoTecnicoTab";
import { DeleteProtocoloButton } from "@/components/protocolos/DeleteProtocoloButton";

// --- Culturas ---
interface Cultura { id: string; nome: string; descricao: string | null; }

type ObjetivoSugestao = {
  id: string;
  cultura_id: string | null;
  texto: string;
  ordem: number;
  ativo: boolean;
};

function ObjetivosCulturaPanel({ culturaId, canManage }: { culturaId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<ObjetivoSugestao[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoTexto, setNovoTexto] = useState("");
  const [novaOrdem, setNovaOrdem] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [editOrdem, setEditOrdem] = useState("0");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["objetivos-visita-sugestoes"] });
    qc.invalidateQueries({ queryKey: ["objetivos-sugestoes-admin"] });
  };

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("objetivos_visita_sugestoes")
      .select("id, cultura_id, texto, ordem, ativo")
      .eq("cultura_id", culturaId)
      .order("ordem")
      .order("texto");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data || []) as ObjetivoSugestao[]);
  };

  useEffect(() => { fetchItems(); /* eslint-disable-next-line */ }, [culturaId]);

  const handleAdd = async () => {
    const texto = novoTexto.trim();
    if (!texto) { toast.error("Informe o texto do objetivo."); return; }
    const ordem = Number.isFinite(parseInt(novaOrdem, 10)) ? parseInt(novaOrdem, 10) : 0;
    const { error } = await supabase.from("objetivos_visita_sugestoes").insert({
      cultura_id: culturaId, texto, ordem, ativo: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Objetivo adicionado");
    setNovoTexto(""); setNovaOrdem("0");
    invalidate(); fetchItems();
  };

  const startEdit = (s: ObjetivoSugestao) => {
    setEditingId(s.id);
    setEditTexto(s.texto);
    setEditOrdem(String(s.ordem ?? 0));
  };

  const cancelEdit = () => { setEditingId(null); setEditTexto(""); setEditOrdem("0"); };

  const saveEdit = async () => {
    if (!editingId) return;
    const texto = editTexto.trim();
    if (!texto) { toast.error("Texto obrigatório"); return; }
    const ordem = Number.isFinite(parseInt(editOrdem, 10)) ? parseInt(editOrdem, 10) : 0;
    const { error } = await supabase
      .from("objetivos_visita_sugestoes")
      .update({ texto, ordem })
      .eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Objetivo atualizado");
    cancelEdit();
    invalidate(); fetchItems();
  };

  const toggleAtivo = async (s: ObjetivoSugestao) => {
    const { error } = await supabase
      .from("objetivos_visita_sugestoes")
      .update({ ativo: !s.ativo })
      .eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    invalidate(); fetchItems();
  };

  const removeItem = async (id: string) => {
    if (!confirm("Excluir este objetivo?")) return;
    const { error } = await supabase.from("objetivos_visita_sugestoes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Objetivo excluído");
    invalidate(); fetchItems();
  };

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <Label className="text-xs">Novo objetivo</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Ex: Avaliar pressão de lagartas"
              value={novoTexto}
              onChange={(e) => setNovoTexto(e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Ordem"
              value={novaOrdem}
              onChange={(e) => setNovaOrdem(e.target.value)}
              className="sm:w-24"
            />
            <Button type="button" onClick={handleAdd} className="gap-1.5">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Texto</TableHead>
              <TableHead className="w-[80px] text-center">Ordem</TableHead>
              <TableHead className="w-[90px] text-center">Ativo</TableHead>
              {canManage && <TableHead className="w-[120px] text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={canManage ? 4 : 3} className="text-center text-muted-foreground py-6">Nenhum objetivo associado a esta cultura.</TableCell></TableRow>
            ) : items.map((s) => editingId === s.id ? (
              <TableRow key={s.id}>
                <TableCell><Input value={editTexto} onChange={(e) => setEditTexto(e.target.value)} /></TableCell>
                <TableCell><Input type="number" value={editOrdem} onChange={(e) => setEditOrdem(e.target.value)} className="w-20" /></TableCell>
                <TableCell className="text-center">
                  <Switch checked={s.ativo} onCheckedChange={() => toggleAtivo(s)} />
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" onClick={saveEdit}>Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancelar</Button>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.texto}</TableCell>
                <TableCell className="text-center">{s.ordem}</TableCell>
                <TableCell className="text-center">
                  {canManage ? (
                    <Switch checked={s.ativo} onCheckedChange={() => toggleAtivo(s)} />
                  ) : (
                    s.ativo ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>
                  )}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(s)}>
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeItem(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!canManage && (
        <p className="text-[11px] text-muted-foreground italic">
          Você não tem permissão para editar objetivos. Apenas administradores e gestores podem alterar esta lista.
        </p>
      )}
    </div>
  );
}

function CulturasTab() {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const canManageObjetivos = role === "administrador" || role === "gestor";
  const [items, setItems] = useState<Cultura[]>([]);
  const [open, setOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Cultura | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const [activeTab, setActiveTab] = useState<"dados" | "objetivos">("dados");

  const fetch = async () => {
    const { data } = await supabase.from("culturas").select("*").order("nome");
    if (data) setItems(data as Cultura[]);
  };
  useEffect(() => { fetch(); }, []);

  const resetForm = () => {
    setForm({ nome: "", descricao: "" });
    setEditingItem(null);
    setActiveTab("dados");
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetForm();
  };

  const handleEdit = (c: Cultura) => {
    setEditingItem(c);
    setForm({ nome: c.nome, descricao: c.descricao || "" });
    setActiveTab("dados");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { nome: form.nome, descricao: form.descricao || null };
    if (editingItem) {
      const { error } = await supabase.from("culturas").update(payload).eq("id", editingItem.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Cultura atualizada!");
      fetch();
    } else {
      const { data, error } = await supabase.from("culturas").insert([payload]).select().single();
      if (error) { toast.error(error.message); return; }
      toast.success("Cultura cadastrada! Agora você pode adicionar objetivos de visita.");
      setEditingItem(data as Cultura);
      setActiveTab("objetivos");
      fetch();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button size="sm" onClick={resetForm}><Plus className="h-4 w-4 mr-1" />Nova Cultura</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingItem ? "Editar Cultura" : "Nova Cultura"}</DialogTitle></DialogHeader>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "dados" | "objetivos")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="objetivos" disabled={!editingItem}>
                  Objetivos de Visita
                </TabsTrigger>
              </TabsList>
              <TabsContent value="dados">
                <form onSubmit={handleSubmit} className="form-spacing-mobile pt-2">
                  <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} required /></div>
                  <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm({...form, descricao: e.target.value})} rows={2} /></div>
                  <Button type="submit" className="w-full h-12 sm:h-10 font-bold">Salvar</Button>
                  {!editingItem && (
                    <p className="text-[11px] text-muted-foreground italic text-center">
                      Salve a cultura para liberar a aba "Objetivos de Visita".
                    </p>
                  )}
                </form>
              </TabsContent>
              <TabsContent value="objetivos" className="pt-2">
                {editingItem ? (
                  <ObjetivosCulturaPanel culturaId={editingItem.id} canManage={canManageObjetivos} />
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Salve a cultura primeiro.</p>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
      <ResponsiveTable
        mobileCards={
          items.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Nenhuma cultura cadastrada</div>
          ) : (
            items.map((c) => (
              <MobileCard
                key={c.id}
                onClick={() => handleEdit(c)}
                ariaLabel={`Editar ${c.nome}`}
                title={c.nome}
                content={[
                  { label: "Descrição", value: c.descricao || "—" },
                ]}
                actions={
                  <div onClick={stopRowClick}>
                    <DeleteProtocoloButton table="culturas" id={c.id} label={c.nome} itemLabel="cultura" onDeleted={fetch} />
                  </div>
                }
              />
            ))
          )
        }
      >
        <Table>
          <TableHeader><TableRow><TableHead>Cultura</TableHead><TableHead>Descrição</TableHead><TableHead className="w-[50px]"></TableHead></TableRow></TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhuma cultura cadastrada</TableCell></TableRow>
            ) : items.map((c) => (
              <TableRow key={c.id} {...rowClickProps(() => handleEdit(c))}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.descricao || "—"}</TableCell>
                <TableCell className="text-right" onClick={stopRowClick}>
                  <DeleteProtocoloButton table="culturas" id={c.id} label={c.nome} itemLabel="cultura" onDeleted={fetch} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ResponsiveTable>
    </div>
  );
}


// --- Problemas (Catálogo unificado) ---
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rowClickProps, stopRowClick } from "@/lib/rowClick";
import { cn } from "@/lib/utils";
import { Search, Pencil, Filter, CheckCircle2, XCircle } from "lucide-react";
import { DialogFooter } from "@/components/ui/dialog";

const CATEGORIA_LABELS: Record<string, string> = {
  insetos_praga: "Pragas",
  doencas_fungicas: "Doenças fúngicas",
  doencas_bacterianas: "Doenças bacterianas",
  nematoides: "Nematoides",
  plantas_daninhas: "Plantas daninhas",
  desequilibrio_biologico_solo: "Solo",
  baixa_vitalidade: "Nutricional",
  fitotoxidade: "Falha operacional",
  outro: "Outros",
};

function ProblemasTab() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [catFilter, setCatFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState({
    nome: "",
    nome_cientifico: "",
    categoria: "outro",
    ativo: true,
  });

  const { data: problemas, isLoading } = useQuery({
    queryKey: ["catalogo-problemas-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_problemas")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingItem) {
        const { error } = await supabase
          .from("catalogo_problemas")
          .update(payload)
          .eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("catalogo_problemas")
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogo-problemas-admin"] });
      queryClient.invalidateQueries({ queryKey: ["catalogo-problemas-ativo"] });
      toast.success(editingItem ? "Atualizado!" : "Cadastrado!");
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("catalogo_problemas")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogo-problemas-admin"] });
      queryClient.invalidateQueries({ queryKey: ["catalogo-problemas-ativo"] });
      toast.success("Status atualizado");
    },
  });

  const resetForm = () => {
    setFormData({ nome: "", nome_cientifico: "", categoria: "outro", ativo: true });
    setEditingItem(null);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      nome: item.nome,
      nome_cientifico: item.nome_cientifico || "",
      categoria: item.categoria,
      ativo: item.ativo,
    });
    setDialogOpen(true);
  };

  const filtered = (problemas || []).filter((p: any) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      p.nome.toLowerCase().includes(s) ||
      (p.nome_cientifico?.toLowerCase().includes(s));
    const matchesCat = catFilter === "todas" || p.categoria === catFilter;
    const matchesStatus =
      statusFilter === "todos" ||
      (statusFilter === "ativos" && p.ativo) ||
      (statusFilter === "inativos" && !p.ativo);
    return matchesSearch && matchesCat && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap gap-3 flex-1">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou nome científico..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-52">
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas Categorias</SelectItem>
                {Object.entries(CATEGORIA_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Status</SelectItem>
                <SelectItem value="ativos">Apenas Ativos</SelectItem>
                <SelectItem value="inativos">Apenas Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Problema
        </Button>
      </div>

      <ResponsiveTable
        mobileCards={
          isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground italic">Nenhum problema encontrado</div>
          ) : (
            filtered.map((p: any) => (
              <MobileCard
                key={p.id}
                onClick={() => handleEdit(p)}
                ariaLabel={`Editar ${p.nome}`}
                title={p.nome}
                subtitle={p.nome_cientifico}
                status={
                  <Badge
                    variant={p.ativo ? "default" : "secondary"}
                    className={cn(
                      "text-[10px]",
                      p.ativo
                        ? "bg-green-100 text-green-700 hover:bg-green-200 border-green-200"
                        : "bg-gray-100 text-gray-500 border-gray-200 italic"
                    )}
                  >
                    {p.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                }
                content={[{ label: "Categoria", value: CATEGORIA_LABELS[p.categoria] || p.categoria }]}
                actions={
                  <div className="flex w-full gap-2" onClick={stopRowClick}>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(p)}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => toggleAtivoMutation.mutate({ id: p.id, ativo: !p.ativo })}
                    >
                      {p.ativo ? (
                        <><XCircle className="h-4 w-4 mr-2 text-destructive" /> Inativar</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 mr-2 text-primary" /> Ativar</>
                      )}
                    </Button>
                  </div>
                }
              />
            ))
          )
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Problema</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum problema cadastrado</TableCell></TableRow>
            ) : (
              filtered.map((p: any) => (
                <TableRow key={p.id} {...rowClickProps(() => handleEdit(p))}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{p.nome}</span>
                      {p.nome_cientifico && (
                        <span className="text-xs text-muted-foreground italic">{p.nome_cientifico}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{CATEGORIA_LABELS[p.categoria] || p.categoria}</Badge>
                  </TableCell>
                  <TableCell>
                    {p.ativo ? (
                      <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-500 border-gray-200 italic">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2" onClick={stopRowClick}>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleAtivoMutation.mutate({ id: p.id, ativo: !p.ativo })}
                    >
                      {p.ativo ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ResponsiveTable>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Problema" : "Novo Problema"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do problema *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome científico (opcional)</Label>
              <Input
                value={formData.nome_cientifico}
                onChange={(e) => setFormData({ ...formData, nome_cientifico: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select
                value={formData.categoria}
                onValueChange={(v) => setFormData({ ...formData, categoria: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIA_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending || !formData.nome.trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Microrganismos ---
import { MicrorganismosTab } from "@/components/protocolos/MicrorganismosTab";

// --- Main Page ---
const MAIN_TABS = ["produtos", "microrganismos", "catalogo-tecnico", "culturas", "problemas"] as const;

export default function Protocolos() {
  const [tab, setTab] = useTabParam("tab", MAIN_TABS, "produtos");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Protocolos Técnicos</h1>
        <p className="text-muted-foreground">Cadastro de produtos, culturas, problemas e microrganismos</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="produtos">Produtos</TabsTrigger>
              <TabsTrigger value="microrganismos">Microrganismos</TabsTrigger>
              <TabsTrigger value="catalogo-tecnico">Catálogo Técnico</TabsTrigger>
              <TabsTrigger value="culturas">Culturas</TabsTrigger>
              <TabsTrigger value="problemas">Problemas</TabsTrigger>
            </TabsList>
            <TabsContent value="produtos"><ProdutosTab /></TabsContent>
            <TabsContent value="microrganismos"><MicrorganismosTab /></TabsContent>
            <TabsContent value="catalogo-tecnico"><CatalogoTecnicoTab /></TabsContent>
            <TabsContent value="culturas"><CulturasTab /></TabsContent>
            <TabsContent value="problemas"><ProblemasTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

