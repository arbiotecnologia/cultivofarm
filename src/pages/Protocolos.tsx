import { assertGlobalCatalogWriteBlocked, TENANT_CAN_EDIT_GLOBAL_CATALOG } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useMemo, useState } from "react";
import { TenantHiddenBadge, TenantVisibilityBar, TenantVisibilityToggle, useCanManageTenantVisibility, useManagedVisibility } from "@/components/protocolos/TenantVisibilityControls";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";


import { ProdutosTab } from "@/components/protocolos/ProdutosTab";
import { CatalogoTecnicoTab } from "@/components/protocolos/CatalogoTecnicoTab";
import { DeleteProtocoloButton } from "@/components/protocolos/DeleteProtocoloButton";
import { useCulturas } from "@/hooks/useCulturas";
import { CatalogOriginBadge, OwnedCatalogItemControls } from "@/components/protocolos/OwnedCatalogItemControls";
import { OwnedCatalogItemDialog } from "@/components/protocolos/OwnedCatalogItemDialog";
import { OwnedCatalogConfirmDialog } from "@/components/protocolos/OwnedCatalogConfirmDialog";
import { useOwnedCatalogCapability } from "@/hooks/useOwnedCatalogMutations";
import { TENANT_OWNED_CATALOG_ENABLED } from "@/lib/catalogo/tenantCatalogOwnership";

// --- Culturas ---
// Culturas são base GLOBAL. Escrita de cliente foi revogada no banco
// (global_culturas_client_write_containment); não existe writer servidor
// auditado. Esta aba é somente consulta para todos os perfis.
function CulturasTab() {
  const { data: items, isLoading, isError, error, refetch, isFetching } = useCulturas();
  const allRows = useMemo(() => items ?? [], [items]);
  const tenantVis = useManagedVisibility("cultura", allRows);
  const canManageVis = useCanManageTenantVisibility();
  const rows = tenantVis.displayed;
  const ownedCapability = useOwnedCatalogCapability();
  const [ownedDialog, setOwnedDialog] = useState<{ open: boolean; item: (typeof allRows)[number] | null }>({ open: false, item: null });
  const [ownedConfirm, setOwnedConfirm] = useState<{ item: (typeof allRows)[number]; operation: "archive" | "restore" } | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" data-testid="culturas-readonly-notice">
        Culturas são um cadastro global, disponível somente para consulta.
      </p>
      {TENANT_OWNED_CATALOG_ENABLED && ownedCapability.canManage && (
        <div><Button size="sm" onClick={() => setOwnedDialog({ open: true, item: null })}><Plus className="mr-1 h-4 w-4" />Cultura própria</Button></div>
      )}
      <TenantVisibilityBar v={tenantVis} />

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground" role="status">Carregando culturas...</div>
      ) : isError ? (
        <div className="py-8 text-center space-y-3" role="alert">
          <p className="text-sm text-destructive">
            Não foi possível carregar as culturas. {(error as Error)?.message}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Tentar novamente
          </Button>
        </div>
      ) : (
      <ResponsiveTable
        mobileCards={
          rows.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Nenhuma cultura cadastrada</div>
          ) : (
            rows.map((c) => (
              <MobileCard
                key={c.id}
                title={c.nome}
                content={[
                  { label: "Descrição", value: c.descricao || "—" },
                  { label: "Situação", value: c.ativo ? "Ativa" : "Inativa" },
                  ...(tenantVis.map?.get(c.id)?.hidden ? [{ label: "Empresa", value: "Oculta nesta empresa" }] : []),
                ]}
              />
            ))
          )
        }
      >
        <Table>
          <TableHeader><TableRow><TableHead>Cultura</TableHead><TableHead>Descrição</TableHead><TableHead>Situação</TableHead>{canManageVis && <TableHead className="text-right">Empresa</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={canManageVis ? 4 : 3} className="text-center text-muted-foreground">Nenhuma cultura cadastrada</TableCell></TableRow>
            ) : rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium"><div className="flex items-center gap-2 flex-wrap">{c.nome}<CatalogOriginBadge item={c} /></div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.descricao || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativa" : "Inativa"}</Badge>
                    <TenantHiddenBadge state={tenantVis.map?.get(c.id)} />
                  </div>
                </TableCell>
                {canManageVis && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <TenantVisibilityToggle entity="cultura" item={{ id: c.id, nome: c.nome, ativo: c.ativo }}
                        state={tenantVis.map?.get(c.id)} disabledReason={tenantVis.error ?? (tenantVis.map ? null : "Carregando preferências.")} />
                      <OwnedCatalogItemControls item={c} actorOrganizationId={ownedCapability.scope?.organizationId} canManage={ownedCapability.canManage}
                        onEdit={() => setOwnedDialog({ open: true, item: c })}
                        onArchive={() => setOwnedConfirm({ item: c, operation: "archive" })}
                        onRestore={() => setOwnedConfirm({ item: c, operation: "restore" })} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ResponsiveTable>
      )}
      <OwnedCatalogItemDialog open={ownedDialog.open} onOpenChange={(open) => setOwnedDialog((current) => ({ ...current, open }))}
        entity="cultura" item={ownedDialog.item} onApplied={() => refetch()}
        onLocateGlobal={(id) => { tenantVis.setShowHidden(true); const match = allRows.find((row) => row.id === id); if (match) toast.info(`Item global localizado: ${match.nome}`); }} />
      <OwnedCatalogConfirmDialog item={ownedConfirm?.item ?? null} entity="cultura" operation={ownedConfirm?.operation ?? "archive"}
        onOpenChange={(open) => !open && setOwnedConfirm(null)} onApplied={() => refetch()} />
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

export function ProblemasTab() {
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
      assertGlobalCatalogWriteBlocked();
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
      assertGlobalCatalogWriteBlocked();
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
    if (!TENANT_CAN_EDIT_GLOBAL_CATALOG) return;
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
        {TENANT_CAN_EDIT_GLOBAL_CATALOG && (
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Problema
        </Button>
        )}
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
                ariaLabel={p.nome}
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
                actions={!TENANT_CAN_EDIT_GLOBAL_CATALOG ? undefined :
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
                <TableRow key={p.id} {...(TENANT_CAN_EDIT_GLOBAL_CATALOG ? rowClickProps(() => handleEdit(p)) : {})}>
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
                    {TENANT_CAN_EDIT_GLOBAL_CATALOG && (<>
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
                    </>)}
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

/** Aliases de leitura aceitos na URL (Fase 26C). A gravação usa o canônico. */
const TAB_ALIASES = {
  catalogo: "catalogo-tecnico",
  fichas: "catalogo-tecnico",
  tecnico: "catalogo-tecnico",
  revisao: "catalogo-tecnico",
} as const satisfies Record<string, (typeof MAIN_TABS)[number]>;

export default function Protocolos() {
  const [tab, setTab] = useTabParam("tab", MAIN_TABS, "produtos", TAB_ALIASES);
  useEffect(() => {
    const anterior = document.title;
    document.title = "Base Técnica Agronômica | Cultivo Farm";
    return () => {
      document.title = anterior;
    };
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Base Técnica Agronômica</h1>
        <p className="text-muted-foreground">Produtos, microrganismos, culturas, alvos e recomendações técnicas.</p>
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

