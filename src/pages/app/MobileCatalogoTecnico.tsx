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
import { MicroorganismTechnicalProfileDialog } from "@/components/protocolos/MicroorganismTechnicalProfileDialog";
import { ProductTechnicalProfileDialog } from "@/components/protocolos/ProductTechnicalProfileDialog";
import { useEmbalagensPorItem, formatEmbalagens } from "@/hooks/useEmbalagensPorItem";
import { useCatalogoVolumes, formatVolumesCatalogo } from "@/hooks/useCatalogoVolumes";

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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<Tipo>("todos");
  const [openMicro, setOpenMicro] = useState<any | null>(null);
  const [openProd, setOpenProd] = useState<any | null>(null);
  const { data: embalagens } = useEmbalagensPorItem();
  const { data: volumesCat } = useCatalogoVolumes();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [prod, micro, pp, mp] = await Promise.all([
        supabase.from("produtos").select("id,nome,codigo,tipo,descricao,modo_acao,funcao_completa,ativo,b2b_enabled").eq("ativo", true).order("nome"),
        supabase.from("microrganismos").select("id,nome,nome_cientifico,tipo,funcao_agronomica,descricao,observacoes,ativo,b2b_enabled").eq("ativo", true).order("nome"),
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
      setRows(result); setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tipo !== "todos" && r.tipo !== tipo) return false;
      if (!q) return true;
      return r.nome.toLowerCase().includes(q) || (r.subtitulo ?? "").toLowerCase().includes(q) || (r.funcao ?? "").toLowerCase().includes(q);
    });
  }, [rows, search, tipo]);

  const copyResumo = async (r: Row) => {
    const txt = `${r.nome}${r.subtitulo ? ` (${r.subtitulo})` : ""}\n${r.resumo ?? "Sem resumo cadastrado"}\n\nCultivo Farm · Recomendação técnica exige prescrição agronômica.`;
    await navigator.clipboard.writeText(txt);
    toast.success("Resumo copiado");
  };

  const sendWhatsapp = async (r: Row) => {
    await copyResumo(r);
    toast.message("Texto pronto — cole no WhatsApp");
  };

  return (
    <div className="p-3 space-y-3">
      <h1 className="text-lg font-bold">Catálogo técnico</h1>

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

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">Nada encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={`${r.tipo}-${r.id}`}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] uppercase">{r.tipo}</Badge>
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
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => r.tipo === "produto" ? setOpenProd(r.raw) : setOpenMicro(r.raw)}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Ver
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

      <MicroorganismTechnicalProfileDialog open={!!openMicro} onOpenChange={(v) => !v && setOpenMicro(null)} micro={openMicro} origem="app_mobile" />
      <ProductTechnicalProfileDialog open={!!openProd} onOpenChange={(v) => !v && setOpenProd(null)} produto={openProd} origem="app_mobile" />
    </div>
  );
}
