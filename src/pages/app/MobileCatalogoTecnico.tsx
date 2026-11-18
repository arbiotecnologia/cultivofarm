import { TenantProblemPanel } from "@/components/protocolos/TenantProblemPanel";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { CompactCatalogSelect } from "@/components/catalogo/CompactCatalogSelect";
import { ProdutosTab } from "@/components/protocolos/ProdutosTab";
import { TenantReferencePanel } from "@/components/protocolos/TenantReferencePanel";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, Share2, Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { TechnicalProfileStatusBadge } from "@/components/protocolos/TechnicalProfileStatusBadge";
import { TenantReferenceDialog } from "@/components/protocolos/TenantReferencePanel";
import { ProductTechnicalProfileDialog } from "@/components/protocolos/ProductTechnicalProfileDialog";
import { useEmbalagensPorItem, formatEmbalagens } from "@/hooks/useEmbalagensPorItem";
import { useCatalogoVolumes, formatVolumesCatalogo } from "@/hooks/useCatalogoVolumes";
import { useTenantHiddenIds } from "@/hooks/useTenantCatalogVisibility";
import { catalogoExcludeHidden } from "@/hooks/useCatalogoUnificado";
import { CatalogFamilyFilter } from "@/components/catalogo/CatalogFamilyFilter";
import { catalogFamilyMatches, catalogFamilyLabel, type CatalogFamilyFilter as FamilyFilter } from "@/lib/catalogo/catalogFamilyRead";
import { useActiveTenantName } from "@/hooks/useActiveTenantName";

type Tipo = "todos" | "produto" | "microrganismo";

interface Row {
  id: string;
  tipo: "produto" | "microrganismo";
  nome: string;
  subtitulo: string | null;
  codigo: string | null;
  funcao: string | null;
  ficha_status: string | null;
  resumo: string | null;
  raw: any;
}

export default function MobileCatalogoTecnico() {
  const editor = useTenantCatalogEditor();
  const [section, setSection] = useState("catalogo");
  const [visitedProducts, setVisitedProducts] = useState(false);
  useEffect(() => { if (section === "produtos") setVisitedProducts(true); }, [section]);
  useEffect(() => { setSection("catalogo"); setVisitedProducts(false); setOpenProd(null); setOpenMicro(null); setSearch(""); setFamily("todos"); setTipo("todos"); }, [editor.scope]);
  const { label: tenantLabel } = useActiveTenantName();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Catálogo NOVO do celular: ocultos da empresa saem no servidor. Fichas abertas a partir de registros
  // vinculados usam outras consultas e não são afetadas.
  const hp = useTenantHiddenIds("produto");
  const hm = useTenantHiddenIds("microrganismo");
  const hiddenError = hp.status === "error" ? hp.message : hm.status === "error" ? hm.message : null;
  const hiddenReady = (hp.status === "ready" || hp.status === "global") && (hm.status === "ready" || hm.status === "global");
  const hpKey = hp.status === "ready" ? `${hp.scope.organizationId}|${hp.scope.userId}|${hp.ids.join(",")}` : hp.status;
  const hmKey = hm.status === "ready" ? `${hm.scope.organizationId}|${hm.scope.userId}|${hm.ids.join(",")}` : hm.status;
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<Tipo>("todos");
  const [family, setFamily] = useState<FamilyFilter>("todos");
  const [openMicro, setOpenMicro] = useState<any | null>(null);
  const [openProd, setOpenProd] = useState<any | null>(null);
  const { data: embalagens } = useEmbalagensPorItem();
  const { data: volumesCat } = useCatalogoVolumes();

  useEffect(() => {
    if (!hiddenReady) { setRows([]); setLoading(!hiddenError); return; }
    const current = editor.capture();
    let alive = true;
    const hiddenProd = hp.status === "ready" ? hp.ids : [];
    const hiddenMicro = hm.status === "ready" ? hm.ids : [];
    (async () => {
      setLoading(true);
      setLoadError(null);
      const [prod, micro, pp, mp] = await Promise.all([
        catalogoExcludeHidden(supabase.from("produtos").select("id,nome,codigo,tipo,familia_catalogo,classe_catalogo,descricao,modo_acao,funcao_completa,ativo,b2b_enabled,owner_organization_id").eq("ativo", true), hiddenProd).order("nome"),
        catalogoExcludeHidden(supabase.from("microrganismos").select("id,nome,nome_cientifico,tipo,funcao_agronomica,descricao,observacoes,ativo,b2b_enabled,owner_organization_id").eq("ativo", true), hiddenMicro).order("nome"),
        supabase.from("product_technical_profiles").select("produto_id,status_validacao,resumo_curto"),
        supabase.from("microorganism_technical_profiles").select("microrganismo_id,status_validacao,resumo_curto"),
      ]);
      const ppMap = new Map((pp.data ?? []).map((x: any) => [x.produto_id, x]));
      const mpMap = new Map((mp.data ?? []).map((x: any) => [x.microrganismo_id, x]));
      const result: Row[] = [
        ...(prod.data ?? []).map((p: any) => ({
          id: p.id, tipo: "produto" as const, nome: p.nome, subtitulo: p.tipo, codigo: p.codigo,
          funcao: p.funcao_completa, ficha_status: (ppMap.get(p.id) as any)?.status_validacao ?? null,
          resumo: (ppMap.get(p.id) as any)?.resumo_curto ?? p.descricao ?? null, raw: p,
        })),
        ...(micro.data ?? []).map((m: any) => ({
          id: m.id, tipo: "microrganismo" as const, nome: m.nome, subtitulo: m.nome_cientifico, codigo: null,
          funcao: m.funcao_agronomica, ficha_status: (mpMap.get(m.id) as any)?.status_validacao ?? null,
          resumo: (mpMap.get(m.id) as any)?.resumo_curto ?? m.descricao ?? null, raw: m,
        })),
      ];
      if (!alive || !current()) return; // resposta tardia de escopo anterior é descartada
      if (prod.error || micro.error || pp.error || mp.error) { setRows([]); setLoadError("Não foi possível carregar o catálogo."); setLoading(false); return; }
      setRows(result); setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenReady, hiddenError, hpKey, hmKey, editor.scope]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!catalogFamilyMatches(r, family)) return false;
      if (tipo !== "todos" && r.tipo !== tipo) return false;
      if (!q) return true;
      return r.nome.toLowerCase().includes(q) || (r.subtitulo ?? "").toLowerCase().includes(q) || (r.funcao ?? "").toLowerCase().includes(q);
    });
  }, [rows, search, tipo, family]);

  const copyResumo = async (r: Row) => {
    const txt = `${r.nome}${r.subtitulo ? ` (${r.subtitulo})` : ""}\n${r.resumo ?? "Sem resumo cadastrado"}\n\n${tenantLabel} · Recomendação técnica exige prescrição agronômica.`;
    await navigator.clipboard.writeText(txt);
    toast.success("Resumo copiado");
  };

  const sendWhatsapp = async (r: Row) => {
    await copyResumo(r);
    toast.message("Texto pronto — cole no WhatsApp");
  };

  return (
    <div className="p-3 space-y-3 min-w-0 [&_button]:min-h-11 [&_input]:min-h-11">
      <h1 className="text-lg font-bold">Catálogo técnico</h1>
      <CompactCatalogSelect label="Seção do catálogo" value={section} onChange={setSection} options={[{value:"catalogo",label:"Catálogo técnico"},...(editor.canEdit ? [{value:"produtos",label:"Produtos"},{value:"microrganismos",label:"Microrganismos"},{value:"culturas",label:"Culturas"},{value:"problemas",label:"Problemas"}] : [])]} />
      {visitedProducts && editor.canEdit && <div hidden={section !== "produtos"}><ProdutosTab initialFamily={family} /></div>}
      {section === "produtos" ? null : section === "culturas" || section === "microrganismos" ? <TenantReferencePanel root={section} /> : section === "problemas" ? <TenantProblemPanel /> : <>
      <CatalogFamilyFilter value={family} onChange={setFamily} />

      {editor.canEdit && <Button onClick={() => setSection("produtos")}>Adicionar produto</Button>}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-8 h-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Tabs value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="produto">Produtos</TabsTrigger>
          <TabsTrigger value="microrganismo">Microrg.</TabsTrigger>
        </TabsList>
      </Tabs>

      {hiddenError || loadError ? (
        <p role="alert" className="text-sm text-destructive py-6 text-center">
          {hiddenError ? `Preferências da empresa indisponíveis: ${hiddenError}` : loadError}
        </p>
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-6 space-y-3"><p>Nada encontrado.</p><Button variant="outline" onClick={() => { setFamily("todos"); setTipo("todos"); }}>Buscar em todas as famílias</Button></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={`${r.tipo}-${r.id}`} tabIndex={0} aria-label={`Detalhe de ${r.nome}`} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.tipo === "produto" ? setOpenProd(r.raw) : setOpenMicro(r.raw); } }} onClick={() => r.tipo === "produto" ? setOpenProd(r.raw) : setOpenMicro(r.raw)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] uppercase">{r.tipo}</Badge>
                      <Badge variant="outline" className="text-[10px]">{catalogFamilyLabel(r)}</Badge>
                      <TechnicalProfileStatusBadge status={r.ficha_status} />
                    </div>
                    <div className="font-semibold text-sm mt-1 truncate">{r.nome}</div>
                    {r.subtitulo && <div className="text-[11px] italic text-muted-foreground truncate">{r.subtitulo}</div>}
                  </div>
                </div>
                {r.resumo && <p className="text-xs text-muted-foreground line-clamp-2">{r.resumo}</p>}
                {(() => {
                  const tipos = r.tipo === "produto"
                    ? embalagens?.porProdutoId.get(r.id) ?? []
                    : embalagens?.porMicrorganismoId.get(r.id) ?? [];
                  const vols = r.tipo === "produto"
                    ? volumesCat?.porProdutoId.get(r.id) ?? []
                    : volumesCat?.porMicrorganismoId.get(r.id) ?? [];
                  if (!tipos.length && !vols.length) return null;
                  return (
                    <div className="space-y-0.5">
                      {vols.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/70">Volumes do catálogo:</span> {formatVolumesCatalogo(vols)}
                        </div>
                      )}
                      {tipos.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/70">Formatos de entrega:</span> {formatEmbalagens(tipos)}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="flex gap-1 pt-1" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => r.tipo === "produto" ? setOpenProd(r.raw) : setOpenMicro(r.raw)}>
                    <FileText className="h-3.5 w-3.5 mr-1" />{editor.canEdit && r.raw.owner_organization_id ? (r.ficha_status ? "Editar ficha" : "Criar ficha") : "Ver ficha"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => copyResumo(r)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => sendWhatsapp(r)}>
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      </>}
      {openMicro && <TenantReferenceDialog key={editor.scope + openMicro.id} root="microrganismos" item={{...openMicro,updated_at:openMicro.updated_at??null}} onClose={() => setOpenMicro(null)} onSaved={() => setOpenMicro(null)} />}
      <ProductTechnicalProfileDialog open={!!openProd} onOpenChange={(v) => !v && setOpenProd(null)} produto={openProd} origem="app_mobile" />
    </div>
  );
}
