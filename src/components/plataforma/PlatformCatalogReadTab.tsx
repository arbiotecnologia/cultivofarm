import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { platformCatalogAccess, platformCatalogPageSchema, PLATFORM_CATALOG_LIMIT,
  PLATFORM_CATALOG_MAX_OFFSET, PLATFORM_CATALOG_SEARCH_LIMIT } from "@/lib/catalogo/platformCatalogRead";

// Narrow bridge for the unapplied candidate; never replace generated DB types or the canonical client.
type CatalogReadRpc = (name: "platform_read_global_product_catalog", args: {
  p_search: string; p_limit: number; p_offset: number;
}) => { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };

export function PlatformCatalogReadTab() {
  const actor = useAuth();
  const { ready, scope } = platformCatalogAccess(actor);
  if (actor.loading) return <p role="status">Carregando…</p>;
  if (!ready) return <p role="alert">Sem permissão para consultar o catálogo global.</p>;
  return <CatalogReadPage key={scope} scope={scope} />;
}

function CatalogReadPage({ scope }: { scope: string }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
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
    queryKey: ["platform-catalog-read", scope, search, offset],
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as CatalogReadRpc;
      const { data, error } = await rpc("platform_read_global_product_catalog", {
        p_search: search, p_limit: PLATFORM_CATALOG_LIMIT, p_offset: offset,
      }).abortSignal(signal);
      if (!active.current || signal.aborted || error) throw new Error("catalog_read_unavailable");
      const parsed = platformCatalogPageSchema.safeParse(data);
      if (!parsed.success) throw new Error("catalog_read_unavailable");
      return parsed.data;
    },
  });
  const rows = !query.isFetching && !query.isError ? query.data?.items : undefined;
  return <section aria-labelledby="platform-catalog-title" className="space-y-4">
    <h2 id="platform-catalog-title" className="text-base font-semibold">Consulta do catálogo global</h2>
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
      <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead>Situação</TableHead><TableHead>B2B</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((product) => <TableRow key={product.id}>
        <TableCell className="break-words">{product.codigo ?? "—"}</TableCell>
        <TableCell className="min-w-40 break-words font-medium">{product.nome}</TableCell>
        <TableCell>{product.tipo ?? "—"}</TableCell>
        <TableCell><Badge variant={product.ativo ? "secondary" : "outline"}>{product.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
        <TableCell>{product.b2b_enabled ? "Sim" : "Não"}</TableCell>
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