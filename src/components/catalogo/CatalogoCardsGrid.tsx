import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BookOpen, LayoutGrid, List } from "lucide-react";
import { TechnicalProfileStatusBadge } from "@/components/protocolos/TechnicalProfileStatusBadge";
import { CatalogSearchFilters, CatalogTipoFiltro, CatalogStatusFiltro } from "@/components/protocolos/CatalogSearchFilters";
import { MicroorganismTechnicalProfileDialog } from "@/components/protocolos/MicroorganismTechnicalProfileDialog";
import { ProductTechnicalProfileDialog } from "@/components/protocolos/ProductTechnicalProfileDialog";
import { useCatalogoUnificado, CatalogoUnificadoRow, CatalogoScope, catalogoRevisionPending } from "@/hooks/useCatalogoUnificado";
import { PartnerFichaDrawer } from "./PartnerFichaDrawer";
import { FichaProdutorDrawer } from "@/components/catalogo/FichaProdutorDrawer";
import { CatalogoItemDrawer, type CatalogoFichaScope } from "@/components/catalogo/CatalogoItemDrawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { CatalogoQueryErrorState } from "@/components/catalogo/CatalogoQueryErrorState";
import { CatalogFamilyFilter } from "@/components/catalogo/CatalogFamilyFilter";
import { catalogFamilyMatches, catalogFamilyLabel, type CatalogFamilyFilter as FamilyFilter } from "@/lib/catalogo/catalogFamilyRead";
import type { CatalogFilterBinding } from "@/lib/catalogo/catalogFilterPreferences";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";

type SortKey = "nome_asc" | "nome_desc" | "tipo" | "codigo";

/**
 * FASE 27D — exibição incremental segura.
 * Listas com até CATALOGO_PAGE_SIZE itens renderizam exatamente como antes.
 * Acima disso, os primeiros CATALOGO_PAGE_SIZE são exibidos e o botão
 * "Mostrar mais" apenas aumenta o limite local (sem nova query).
 */
export const CATALOGO_PAGE_SIZE = 60;

export interface CatalogGridSource {
  data?: CatalogoUnificadoRow[]; isLoading: boolean; error: Error | null;
  refetch: () => unknown; isFetching: boolean; scope?: string;
}
interface Props {
  /** Volatile layout-owned preferences; never preserves catalogue rows or open sheets. */
  filterPreferences?: CatalogFilterBinding;
  source?: CatalogGridSource;
  scope: CatalogoScope;
  /** Mostrar filtros de status da ficha e B2B (admin/interno). Default: true */
  showStatusFilter?: boolean;
  showB2BFilter?: boolean;
  /** Mostrar badges internos (composição pendente, sem fonte, pendências de revisão). Default: true para admin/interno */
  showInternalBadges?: boolean;
  /** Ocultar o badge "Ficha aprovada" (parceiro/comercial). Default: true para scope b2b */
  hideApprovedBadge?: boolean;
  /** Slot opcional renderizado abaixo dos volumes (ex.: preço B2B do parceiro) */
  pricingSlot?: (row: CatalogoUnificadoRow) => ReactNode;
  /** Slot opcional de ação (ex.: Adicionar ao carrinho, Selecionar). Renderiza ao lado de "Ver ficha". */
  actionSlot?: (row: CatalogoUnificadoRow) => ReactNode;
  /** Pré-filtros (ex.: somente produtos B2B no simulador) */
  filterRow?: (row: CatalogoUnificadoRow) => boolean;
  /** Origem para log de acesso à ficha */
  fichaOrigem?: "protocolos" | "app_mobile";
}

export function CatalogoCardsGrid(props: Props) {
  return props.source ? <CatalogGridView {...props} source={props.source} key={props.source.scope} /> : <LegacyCatalogGrid {...props} />;
}
function LegacyCatalogGrid(props: Props) {
  const source = useCatalogoUnificado(props.scope);
  return <CatalogGridView {...props} source={source} />;
}
function CatalogGridView({
  source,
  scope,
  showStatusFilter = scope !== "b2b",
  showB2BFilter = scope !== "b2b",
  showInternalBadges = scope !== "b2b",
  hideApprovedBadge = scope === "b2b",
  pricingSlot,
  actionSlot,
  filterRow,
  fichaOrigem = "protocolos",
  filterPreferences,
}: Props & { source: CatalogGridSource }) {
  const { data, isLoading, error, refetch, isFetching } = source;
  const editor = useTenantCatalogEditor();

  const [search, setSearch] = useState(filterPreferences?.initial.search ?? "");
  const [tipo, setTipo] = useState<CatalogTipoFiltro>(filterPreferences?.initial.tipo ?? "todos");
  const [family, setFamily] = useState<FamilyFilter>(filterPreferences?.initial.family ?? "todos");
  const [status, setStatus] = useState<CatalogStatusFiltro>(filterPreferences?.initial.status ?? "todos");
  const [b2b, setB2b] = useState<"todos" | "sim" | "nao">(filterPreferences?.initial.b2b ?? "todos");
  const [sort, setSort] = useState<SortKey>(filterPreferences?.initial.sort ?? "nome_asc");
  useEffect(() => {
    filterPreferences?.onChange({ search, tipo, family, status, b2b, sort });
  }, [search, tipo, family, status, b2b, sort, filterPreferences]);
  const [openMicro, setOpenMicro] = useState<any | null>(null);
  const [openProd, setOpenProd] = useState<any | null>(null);
  const [fichaB2B, setFichaB2B] = useState<{ id: string; tipo: "produto" | "microrganismo" } | null>(null);
  // Fase 26D — ficha unificada (somente leitura). Não substitui os dialogs atuais.
  const [fichaUnificada, setFichaUnificada] = useState<CatalogoUnificadoRow | null>(null);
  const isMobile = useIsMobile();
  const [view, setView] = useState<"cards" | "lista">(() => {
    try {
      const v = localStorage.getItem("catalogo:view");
      return v === "lista" ? "lista" : "cards";
    } catch {
      return "cards";
    }
  });
  useEffect(() => {
    try { localStorage.setItem("catalogo:view", view); } catch { /* noop */ }
  }, [view]);
  const effectiveView: "cards" | "lista" = isMobile ? "cards" : view;
  const showPriceCol = !!pricingSlot;

  const renderStatusBadges = (r: CatalogoUnificadoRow) => (
    <div className="flex gap-1 flex-wrap">
      <TechnicalProfileStatusBadge status={r.ficha_status} hideWhenApproved={hideApprovedBadge} />
      {showInternalBadges && r.tipo === "produto" && (
        <Badge variant="outline" className={`text-[10px] ${(r.composicao_count ?? 0) > 0 ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}`}>
          {(r.composicao_count ?? 0) > 0 ? "Composição OK" : "Composição pendente"}
        </Badge>
      )}
      {showInternalBadges && r.ficha_status === "aprovado" && r.fontes_count === 0 && (
        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">
          <BookOpen className="h-3 w-3 mr-1" />
          Sem fonte técnica
        </Badge>
      )}
      {showInternalBadges && r.ficha_status === "em_revisao" && (() => {
        const pend = catalogoRevisionPending(r);
        if (pend.length === 0) {
          return (
            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-800 bg-emerald-50">
              Pronta para revisão
            </Badge>
          );
        }
        return pend.map((p) => (
          <Badge key={p} variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">
            {p}
          </Badge>
        ));
      })()}
    </div>
  );

  // FASE 27D — callbacks memoizados (compartilhados por todos os cards/linhas).
  const abrirVerFicha = useCallback((r: CatalogoUnificadoRow) => {
    if (scope === "b2b") {
      if (source.scope) setFichaB2B({ id: r.id, tipo: r.tipo });
      else setFichaB2B({ id: r.id, tipo: r.tipo });
      return;
    }
    if (r.tipo === "produto") setOpenProd(r.raw);
    else setOpenMicro(r.raw);
  }, [scope, source.scope]);

  const abrirFichaCompleta = useCallback((r: CatalogoUnificadoRow) => {
    if (scope === "b2b" && source.scope) { setFichaB2B({ id: r.id, tipo: r.tipo }); return; }
    setFichaUnificada(r);
  }, [scope, source.scope]);

  const renderActions = (r: CatalogoUnificadoRow) => (
    <div className="flex gap-1 justify-end flex-wrap">
      <Button
        size="sm"
        variant="outline"
        onClick={() => abrirVerFicha(r)}
      >
        {scope === "admin" && editor.canEdit && r.raw?.owner_organization_id ? (r.ficha_status ? "Editar ficha" : "Criar ficha") : "Ver ficha"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-xs"
        onClick={() => abrirFichaCompleta(r)}
      >
        Ficha completa
      </Button>
      {actionSlot && actionSlot(r)}
    </div>
  );


  const rows = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterRow && !filterRow(r)) return false;
      if (!catalogFamilyMatches(r, family)) return false;
      if (tipo !== "todos" && r.tipo !== tipo) return false;
      if (showB2BFilter) {
        if (b2b === "sim" && !r.b2b_enabled) return false;
        if (b2b === "nao" && r.b2b_enabled) return false;
      }
      if (showStatusFilter && status !== "todos") {
        const eff = r.ficha_status ?? "sem_ficha";
        if (status === "sem_ficha" && r.ficha_status) return false;
        if (status !== "sem_ficha" && eff !== status) return false;
      }
      if (!q) return true;
      return (
        r.nome.toLowerCase().includes(q) ||
        (r.subtitulo ?? "").toLowerCase().includes(q) ||
        (r.codigo ?? "").toLowerCase().includes(q) ||
        (r.funcao ?? "").toLowerCase().includes(q) ||
        (r.ficha_resumo ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, tipo, status, b2b, filterRow, showB2BFilter, showStatusFilter, family, scope]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const byNome = (a: CatalogoUnificadoRow, b: CatalogoUnificadoRow) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    if (sort === "nome_asc") list.sort(byNome);
    else if (sort === "nome_desc") list.sort((a, b) => byNome(b, a));
    else if (sort === "tipo") list.sort((a, b) => a.tipo.localeCompare(b.tipo) || byNome(a, b));
    else if (sort === "codigo") list.sort((a, b) => (a.codigo ?? "\uffff").localeCompare(b.codigo ?? "\uffff") || byNome(a, b));
    return list;
  }, [filtered, sort]);

  // FASE 27D — limite de exibição incremental. Reseta ao mudar filtros/ordenação.
  const [limite, setLimite] = useState(CATALOGO_PAGE_SIZE);
  useEffect(() => {
    setLimite(CATALOGO_PAGE_SIZE);
  }, [search, tipo, status, b2b, sort, scope]);
  useEffect(() => { setLimite(CATALOGO_PAGE_SIZE); }, [family]);

  const visiveis = useMemo(
    () => (sorted.length > limite ? sorted.slice(0, limite) : sorted),
    [sorted, limite],
  );
  const restantes = sorted.length - visiveis.length;

  if (error) return <CatalogoQueryErrorState error={error} retry={refetch} busy={isFetching} />;

  return (
    <div className="space-y-4">
      <CatalogFamilyFilter value={family} onChange={setFamily} />
      <div className="flex flex-col md:flex-row gap-2 md:items-stretch">
        <div className="flex-1">
          <CatalogSearchFilters
            search={search} onSearch={setSearch}
            tipo={tipo} onTipo={setTipo}
            status={status} onStatus={setStatus}
            b2b={b2b} onB2b={setB2b}
            showStatus={showStatusFilter}
            showB2b={showB2BFilter}
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full md:w-44" aria-label="Ordenar catálogo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nome_asc">Nome (A→Z)</SelectItem>
            <SelectItem value="nome_desc">Nome (Z→A)</SelectItem>
            <SelectItem value="tipo">Tipo</SelectItem>
            <SelectItem value="codigo">Código</SelectItem>
          </SelectContent>
        </Select>
        {!isMobile && (
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as "cards" | "lista")}
            className="border rounded-md"
            aria-label="Modo de visualização"
          >
            <ToggleGroupItem value="cards" aria-label="Visualizar em cards" className="h-9 px-3">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="lista" aria-label="Visualizar em lista" className="h-9 px-3">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-3">
            {rows.length === 0 ? (
              <p>Nenhum item encontrado.</p>
            ) : (
              <>
                <p>Nenhum item encontrado para os filtros aplicados.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setTipo("todos");
                    setStatus("todos");
                    setB2b("todos");
                    setFamily("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : effectiveView === "lista" ? (
        <Card>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%]">Item</TableHead>
                <TableHead className="w-[34%]">Resumo técnico</TableHead>
                <TableHead className="w-[14%]">Indicadores</TableHead>
                <TableHead className="w-[20%] text-right">{showPriceCol ? "Preço / Ações" : "Ações"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((r) => {
                const modoAcao = r.tipo === "produto" ? (r.raw?.modo_acao ?? null) : r.mecanismo_acao;
                const modoLabel = r.tipo === "produto" ? "Modo" : "Mec.";
                return (
                  <TableRow key={`${r.tipo}-${r.id}`} className="hover:bg-muted/30">
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[9px] uppercase">{r.tipo}</Badge>
                        {scope !== "b2b" && <Badge variant="outline">{catalogFamilyLabel(r)}</Badge>}
                        {r.codigo && <span className="font-mono text-[10px] text-muted-foreground">{r.codigo}</span>}
                        {!r.ativo && <Badge variant="destructive" className="text-[9px]">Inativo</Badge>}
                        {r.b2b_enabled && <Badge className="text-[9px] bg-blue-600">B2B</Badge>}
                      </div>
                      <div className="font-semibold text-sm mt-1 break-words" title={r.nome}>{r.nome}</div>
                      {r.subtitulo && (
                        <div className="text-xs italic text-muted-foreground truncate" title={r.subtitulo}>{r.subtitulo}</div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {r.funcao && (
                        <p className="text-xs text-muted-foreground line-clamp-1" title={r.funcao}>{r.funcao}</p>
                      )}
                      {modoAcao && (
                        <div
                          className="text-[10px] mt-1 inline-block max-w-full truncate rounded border px-1.5 py-0.5"
                          title={`${modoLabel}: ${modoAcao}`}
                        >
                          {modoLabel}: {modoAcao}
                        </div>
                      )}
                      {r.tipo === "microrganismo" && r.beneficios_agronomicos && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1" title={r.beneficios_agronomicos}>
                          <span className="font-medium text-foreground/70">Benef.:</span> {r.beneficios_agronomicos}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Alvos: {r.alvos_count ?? 0}
                        </Badge>
                        {showInternalBadges && r.fontes_count > 0 && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Fontes: {r.fontes_count}
                          </Badge>
                        )}
                        {renderStatusBadges(r)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col items-end gap-1">
                        {showPriceCol && (
                          <div className="text-right w-full">{pricingSlot?.(r)}</div>
                        )}
                        {renderActions(r)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visiveis.map((r) => {
            const modoAcao = r.tipo === "produto" ? (r.raw?.modo_acao ?? null) : r.mecanismo_acao;
            return (
              <Card key={`${r.tipo}-${r.id}`} className="hover:border-primary/40 transition">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[9px] uppercase">{r.tipo}</Badge>
                        {scope !== "b2b" && <Badge variant="outline">{catalogFamilyLabel(r)}</Badge>}
                        {r.codigo && <span className="font-mono text-[10px] text-muted-foreground">{r.codigo}</span>}
                        {!r.ativo && <Badge variant="destructive" className="text-[9px]">Inativo</Badge>}
                        {r.b2b_enabled && <Badge className="text-[9px] bg-blue-600">B2B</Badge>}
                      </div>
                      <div className="font-semibold truncate mt-1">{r.nome}</div>
                      {r.subtitulo && <div className="text-xs italic text-muted-foreground truncate">{r.subtitulo}</div>}
                    </div>
                  </div>
                  {r.funcao && <p className="text-xs text-muted-foreground line-clamp-2">{r.funcao}</p>}
                  {r.ficha_resumo && (
                    <p className="text-xs text-foreground/80 line-clamp-2">{r.ficha_resumo}</p>
                  )}
                  {r.tipo === "microrganismo" && r.beneficios_agronomicos && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      <span className="font-medium text-foreground/70">Benefícios:</span>{" "}
                      {r.beneficios_agronomicos}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {modoAcao && (
                      <Badge variant="outline" className="text-[10px] font-normal max-w-full truncate">
                        {r.tipo === "produto" ? "Modo de ação" : "Mecanismo"}: {modoAcao}
                      </Badge>
                    )}
                    {r.alvos_count > 0 && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Alvos: {r.alvos_count}
                      </Badge>
                    )}
                    {showInternalBadges && r.fontes_count > 0 && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Fontes: {r.fontes_count}
                      </Badge>
                    )}
                  </div>

                  {pricingSlot && <div className="pt-1">{pricingSlot(r)}</div>}
                  <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
                    {renderStatusBadges(r)}
                    {renderActions(r)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {restantes > 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimite((l) => l + CATALOGO_PAGE_SIZE)}
          >
            Mostrar mais ({restantes})
          </Button>
        </div>
      )}

      <MicroorganismTechnicalProfileDialog
        open={!!openMicro}
        onOpenChange={(v) => !v && setOpenMicro(null)}
        micro={openMicro}
        origem={fichaOrigem}
      />
      <ProductTechnicalProfileDialog
        open={!!openProd}
        onOpenChange={(v) => !v && setOpenProd(null)}
        produto={openProd}
        origem={fichaOrigem}
      />
      <CatalogoItemDrawer
        item={fichaUnificada ? rows.find(r => r.id === fichaUnificada.id && r.tipo === fichaUnificada.tipo) ?? null : null}
        open={!!fichaUnificada}
        onOpenChange={(v) => !v && setFichaUnificada(null)}
        scope={scope as CatalogoFichaScope}
      />
      {source.scope ? <PartnerFichaDrawer
        item={fichaB2B ? rows.find(r => r.id === fichaB2B.id && r.tipo === fichaB2B.tipo) ?? null : null}
        open={!!fichaB2B} onOpenChange={v => !v && setFichaB2B(null)}
      /> : <FichaProdutorDrawer
        open={!!fichaB2B}
        onOpenChange={(v) => !v && setFichaB2B(null)}
        itemId={fichaB2B?.id ?? null}
        tipo={fichaB2B?.tipo ?? "produto"}
        origem="portal_parceiro"
      />}


      <p className="text-[10px] text-muted-foreground text-center italic pt-2">
        As recomendações de bioinsumos exigem avaliação técnica e prescrição agronômica conforme cultura, alvo, ambiente, histórico da área e manejo adotado.
      </p>
    </div>
  );
}
