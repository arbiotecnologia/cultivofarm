import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformCatalogEntityPanel } from "@/components/plataforma/PlatformCatalogEntityPanel";
import { PlatformCatalogVolumesDialog } from "@/components/plataforma/PlatformCatalogVolumesDialog";
import { PlatformCatalogMetadataDialog } from "@/components/plataforma/PlatformCatalogMetadataDialog";
import { PlatformCatalogB2BDialog } from "@/components/plataforma/PlatformCatalogB2BDialog";
import { PlatformCatalogFamilyDialog } from "@/components/plataforma/PlatformCatalogFamilyDialog";
import { PlatformCatalogCompositionDialog } from "@/components/plataforma/PlatformCatalogCompositionDialog";
import { CATALOG_TABS, CLASS_LABEL, FAMILY_LABEL, parseCatalogView, parseReview,
  type FamilyTarget, type ProductFamily, type ReviewFilter } from "@/lib/catalogo/platformCatalogFamily";
import { PlatformCatalogCreateDialog, PlatformCatalogStatusDialog } from "@/components/plataforma/PlatformCatalogLifecycleDialogs";
import { platformCatalogAccess, platformCatalogPageSchema, PLATFORM_CATALOG_LIMIT,
  PLATFORM_CATALOG_MAX_OFFSET, PLATFORM_CATALOG_SEARCH_LIMIT } from "@/lib/catalogo/platformCatalogRead";

// Narrow bridge for the externally applied reader; preserve canonical client and generated types.
type CatalogReadRpc = (name: "platform_read_global_product_catalog_by_family", args: {
  p_familia: ProductFamily | null; p_revisao: ReviewFilter; p_search: string; p_limit: number; p_offset: number;
}) => { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };

export function PlatformCatalogReadTab() {
  const actor = useAuth();
  const { ready, scope } = platformCatalogAccess(actor);
  if (actor.loading) return <p role="status">Carregando…</p>;
  if (!ready) return <p role="alert">Sem permissão para consultar o catálogo global.</p>;
  return <CatalogTabs key={scope} scope={scope} />;
}

/** Quatro abas globais (ordem fixa) + Cadastros de apoio; estado em query param, sem rota paralela. */
function CatalogTabs({ scope }: { scope: string }) {
  const [params, setParams] = useSearchParams();
  const view = parseCatalogView(params.get("catalogo"));
  const review = parseReview(params.get("revisao"));
  const update = (patch: Record<string, string | null>) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    return next;
  }, { replace: true });
  return <div className="space-y-4">
    <Tabs value={view === "culturas" ? "" : view} onValueChange={(v) => update({ catalogo: v })} className="space-y-4">
      <TabsList aria-label="Catálogo global" className="flex h-auto w-full justify-start overflow-x-auto">
        {CATALOG_TABS.map((t) => <TabsTrigger key={t.value} value={t.value} className="min-h-10 shrink-0 whitespace-nowrap">{t.label}</TabsTrigger>)}
      </TabsList>
      {CATALOG_TABS.map((t) => <TabsContent key={t.value} value={t.value}>
        {"family" in t ? <CatalogReadPage key={t.family} scope={scope} family={t.family} review={review}
          onReview={(r) => update({ revisao: r === "familia" ? null : r })} />
          : <PlatformCatalogEntityPanel kind="micro" scope={scope} />}
      </TabsContent>)}
    </Tabs>
    <nav aria-label="Cadastros de apoio" className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
      <span className="text-muted-foreground">Cadastros de apoio:</span>
      <Button variant={view === "culturas" ? "secondary" : "outline"} size="sm" className="min-h-10"
        aria-pressed={view === "culturas"} onClick={() => update({ catalogo: "culturas" })}>Culturas</Button>
    </nav>
    {view === "culturas" && <PlatformCatalogEntityPanel kind="cultura" scope={scope} />}
  </div>;
}

function CatalogReadPage({ scope, family, review, onReview }:
  { scope: string; family: ProductFamily; review: ReviewFilter; onReview(r: ReviewFilter): void }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [volumesOf, setVolumesOf] = useState<{ id: string; nome: string }>();
  const [statusOf, setStatusOf] = useState<{ id: string; nome: string; ativo: boolean; updated_at: string }>();
  const [b2bOf, setB2bOf] = useState<string>();
  const [familyOf, setFamilyOf] = useState<FamilyTarget & { nome: string }>();
  const [compositionOf, setCompositionOf] = useState<{ id: string; nome: string }>();
  const done = () => {
    setEditing(undefined); setCreating(false); setStatusOf(undefined); setB2bOf(undefined); setFamilyOf(undefined); setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ["platform-catalog-read", scope] });
  };
  const queryClient = useQueryClient();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const predicate = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "platform-catalog-read" && q.queryKey[1] !== scope;
    void queryClient.cancelQueries({ predicate });
    queryClient.removeQueries({ predicate });
    return () => {
      active.current = false;
      const queryKey = ["platform-catalog-read", scope];
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    };
  }, [queryClient, scope]);
  const query = useQuery({
    queryKey: ["platform-catalog-read", scope, review === "familia" ? family : null, review, search, offset],
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as CatalogReadRpc;
      const { data, error } = await rpc("platform_read_global_product_catalog_by_family", {
        p_familia: review === "familia" ? family : null, p_revisao: review, p_search: search, p_limit: PLATFORM_CATALOG_LIMIT, p_offset: offset,
      }).abortSignal(signal);
      if (!active.current || signal.aborted || error) throw new Error("catalog_read_unavailable");
      const parsed = platformCatalogPageSchema.safeParse(data);
      if (!parsed.success) throw new Error("catalog_read_unavailable");
      return parsed.data;
    },
  });
  const rows = !query.isFetching && !query.isError ? query.data?.items : undefined;
  return <section aria-labelledby="platform-catalog-title" className="space-y-4">
    <h2 id="platform-catalog-title" className="text-base font-semibold">{review === "familia"
      ? `${FAMILY_LABEL[family]} — catálogo global` : review === "todos" ? "Revisão administrativa — todos os produtos" : "Revisão administrativa — pendentes de classificação"}</h2>
    <div role="group" aria-label="Revisão administrativa" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Exibir:</span>
      {([["familia", `Somente ${FAMILY_LABEL[family]}`], ["todos", "Revisão: todos os produtos"], ["pendentes", "Revisão: pendentes"]] as const).map(([r, text]) =>
        <Button key={r} size="sm" className="min-h-10 whitespace-normal" variant={review === r ? "secondary" : "outline"}
          aria-pressed={review === r} onClick={() => { setOffset(0); onReview(r); }}>{text}</Button>)}
    </div>
    {review === "familia"
      ? <p className="text-sm text-muted-foreground">Mostra somente produtos classificados nesta família. Produtos sem família ficam em “Revisão: pendentes”.</p>
      : <p role="note" className="rounded-md border p-3 text-sm">Revisão administrativa: lista produtos de todas as famílias{review === "pendentes" ? " sem classificação" : ", inclusive pendentes"}, igual em qualquer aba de produtos.</p>}
    {family === "fertilizante_adubo" && review === "familia" && <p role="note" className="rounded-md border p-3 text-sm">Cadastro novo de fertilizantes/adubos ainda não está disponível
      (tipo e unidade próprios pendentes). Nesta fase, classifique aqui produtos já existentes.</p>}
    {saved && <p role="status">Alteração confirmada.</p>}
    {editing && <PlatformCatalogMetadataDialog key={editing} id={editing} scope={scope}
      onClose={() => setEditing(undefined)} onSaved={() => {
        setEditing(undefined); setSaved(true);
        void queryClient.invalidateQueries({ queryKey: ["platform-catalog-read", scope] });
      }} />}
    {volumesOf && <PlatformCatalogVolumesDialog tipo="produto" itemId={volumesOf.id} nome={volumesOf.nome} scope={scope}
      onClose={() => {
        // Apresentações ativas podem atualizar o produto pai (preço/versão): recarregar a lista evita
        // CAS com `updated_at` antigo ao arquivar/reativar/liberar B2B em seguida.
        setVolumesOf(undefined);
        void queryClient.invalidateQueries({ queryKey: ["platform-catalog-read", scope] });
      }} />}
    {b2bOf && <PlatformCatalogB2BDialog key={b2bOf} tipo="produto" itemId={b2bOf} scope={scope}
      onClose={() => setB2bOf(undefined)} onSaved={done} />}
    {creating && <PlatformCatalogCreateDialog scope={scope} onClose={() => setCreating(false)} onSaved={done} />}
    {familyOf && <PlatformCatalogFamilyDialog key={familyOf.id} product={familyOf} scope={scope}
      onClose={() => setFamilyOf(undefined)} onSaved={done} />}
    {compositionOf && <PlatformCatalogCompositionDialog key={compositionOf.id} productId={compositionOf.id} nome={compositionOf.nome} scope={scope}
      onClose={() => setCompositionOf(undefined)} onSaved={() => { setCompositionOf(undefined); done(); }} />}
    {statusOf && <PlatformCatalogStatusDialog key={statusOf.id} scope={scope} product={statusOf}
      onClose={() => setStatusOf(undefined)} onSaved={done} />}
    {family !== "fertilizante_adubo" && <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">O produto criado fica pendente; classifique a família em “Revisão: pendentes”.</span>
      <Button onClick={() => { setSaved(false); setCreating(true); }}>Novo produto global</Button></div>}
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
      event.preventDefault(); setSearch(input.trim()); setOffset(0);
    }}>
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="platform-catalog-search">Buscar por nome ou código</Label>
        <Input id="platform-catalog-search" value={input} maxLength={PLATFORM_CATALOG_SEARCH_LIMIT}
          onChange={(event) => setInput(event.target.value)} />
      </div>
      <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" aria-hidden="true" />Buscar</Button>
    </form>
    {query.isFetching && <p role="status" className="py-6 text-muted-foreground">Carregando…</p>}
    {query.isError && <div role="alert" className="space-y-3 py-6">
      <p>Não foi possível consultar o catálogo global.</p>
      <Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Tentar novamente</Button>
    </div>}
    {rows?.length === 0 && <p role="status" className="py-6 text-muted-foreground">Nenhum produto encontrado.</p>}
    {!!rows?.length && <Table>
      <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Família</TableHead><TableHead>Tipo</TableHead><TableHead>Situação</TableHead><TableHead>B2B</TableHead><TableHead><span className="sr-only">Ações</span></TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((product) => <TableRow key={product.id}>
        <TableCell className="break-words">{product.codigo ?? "—"}</TableCell>
        <TableCell className="min-w-40 break-words font-medium">{product.nome}</TableCell>
        <TableCell>{product.familia_catalogo
          ? <span>{FAMILY_LABEL[product.familia_catalogo]}{product.classe_catalogo ? ` · ${CLASS_LABEL[product.classe_catalogo]}` : ""}</span>
          : <Badge variant="outline">Pendente</Badge>}</TableCell>
        <TableCell>{product.tipo ?? "—"}</TableCell>
        <TableCell><Badge variant={product.ativo ? "secondary" : "outline"}>{product.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
        <TableCell>{product.b2b_enabled ? "Sim" : "Não"}</TableCell>
        <TableCell><Button variant="outline" size="sm" aria-label={`Editar ${product.nome}`} disabled={!product.updated_at}
          onClick={() => { setSaved(false); setEditing(product.id); }}>Editar</Button>
          <Button variant="ghost" size="sm" className="ml-1" aria-label={`${product.ativo ? "Arquivar" : "Reativar"} ${product.nome}`} disabled={!product.updated_at}
            onClick={() => { setSaved(false); if (product.updated_at) setStatusOf({ id: product.id, nome: product.nome, ativo: product.ativo, updated_at: product.updated_at }); }}>
            {product.ativo ? "Arquivar" : "Reativar"}</Button>
          <Button variant="ghost" size="sm" className="ml-1" aria-label={`Classificar família de ${product.nome}`} disabled={!product.updated_at}
            onClick={() => { setSaved(false); if (product.updated_at) setFamilyOf({ id: product.id, nome: product.nome, updated_at: product.updated_at,
              familia_catalogo: product.familia_catalogo, classe_catalogo: product.classe_catalogo }); }}>Classificar</Button>
          <Button variant="ghost" size="sm" className="ml-1" aria-label={`Apresentações de ${product.nome}`}
            onClick={() => setVolumesOf({ id: product.id, nome: product.nome })}>Apresentações</Button>
          <Button variant="ghost" size="sm" className="ml-1" aria-label={`Composição de ${product.nome}`}
            onClick={() => { setSaved(false); setCompositionOf({ id: product.id, nome: product.nome }); }}>Composição</Button>
          <Button variant="ghost" size="sm" className="ml-1" aria-label={`Disponibilidade B2B de ${product.nome}`}
            onClick={() => { setSaved(false); setB2bOf(product.id); }}>{product.b2b_enabled ? "Retirar do B2B" : "Liberar B2B"}</Button></TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    <nav aria-label="Paginação do catálogo" className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="outline" size="icon" aria-label="Página anterior" disabled={query.isFetching || query.isError || offset === 0}
        onClick={() => setOffset((value) => Math.max(0, value - PLATFORM_CATALOG_LIMIT))}><ArrowLeft className="h-4 w-4" /></Button>
      <span aria-live="polite" className="text-sm">Página {offset / PLATFORM_CATALOG_LIMIT + 1}</span>
      <Button variant="outline" size="icon" aria-label="Próxima página" disabled={query.isFetching || query.isError || !query.data?.has_more || offset + PLATFORM_CATALOG_LIMIT > PLATFORM_CATALOG_MAX_OFFSET}
        onClick={() => setOffset((value) => value + PLATFORM_CATALOG_LIMIT)}><ArrowRight className="h-4 w-4" /></Button>
    </nav>
  </section>;
}