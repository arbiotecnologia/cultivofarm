import { useEffect, useMemo, useState } from "react";
import { usePartnerCatalogTecnico } from "@/hooks/usePartnerCatalogTecnico";
import { CatalogFamilyFilter } from "@/components/catalogo/CatalogFamilyFilter";
import { catalogFamilyMatches, type CatalogFamilyFilter as FamilyFilter } from "@/lib/catalogo/catalogFamilyRead";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { CatalogoQueryErrorState } from "@/components/catalogo/CatalogoQueryErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { generateFichaTecnicaProdutoPdf } from "@/lib/pdf/fichaTecnicaProdutoPdf";
import { generateFichaTecnicaMicrorganismoPdf } from "@/lib/pdf/fichaTecnicaMicrorganismoPdf";
import { supplierLabel } from "@/lib/comercial/supplierName";
import { useOutletContext } from "react-router-dom";

export default function FichasTecnicas() {
  // Contexto do layout (projeção B2B autorizada); fora do layout → null e rótulo neutro.
  const partner = useOutletContext<{ partner?: { sellerName?: string | null } } | null>()?.partner ?? null;
  const [tab, setTab] = useState<"produtos" | "microrganismos">("produtos");
  const [busca, setBusca] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const catalog = usePartnerCatalogTecnico();
  const access = useStorageAccessScope("c1b-ficha-pdf");
  const [family, setFamily] = useState<FamilyFilter>("todos");
  const eligible = (catalog.data ?? []).filter(r => r.ficha_aprovada && catalogFamilyMatches({ tipo: r.item_tipo, raw: r }, family));
  const produtos = eligible.filter(r => r.item_tipo === "produto").map(r => ({ ...r, id: r.item_id, descricao: r.descricao_curta }));
  const micros = eligible.filter(r => r.item_tipo === "microrganismo").map(r => ({ ...r, id: r.item_id, descricao: r.descricao_curta }));
  const loadingP = catalog.isLoading, loadingM = catalog.isLoading;

  const q = busca.trim().toLowerCase();
  const filtered = useMemo(() => {
    const src = tab === "produtos" ? produtos : micros;
    if (!q) return src;
    return src.filter(
      (r: any) =>
        String(r.nome ?? "").toLowerCase().includes(q) ||
        String(r.codigo ?? "").toLowerCase().includes(q),
    );
  }, [tab, produtos, micros, q]);

  const [preview, setPreview] = useState<{ blobUrl: string; filename: string; nome: string; scope: string } | null>(null);
  const visiblePreview = access.ready && preview?.scope === access.scope ? preview : null;

  const abrirFicha = async (id: string, nome: string, itemTipo: "produto" | "microrganismo") => {
    const capturedTipo = itemTipo;
    const current = access.capture();
    if (!current()) return;
    try {
      setBusyId(id);
      const refreshed = await catalog.refetch();
      if (!current() || refreshed.error || !refreshed.data?.some(r => r.item_id === id && r.item_tipo === capturedTipo && r.ficha_aprovada)) return;
      const result =
        capturedTipo === "produto"
          ? await generateFichaTecnicaProdutoPdf({ produtoId: id, mode: "blob", audience: "b2b", empresaNome: partner?.sellerName ?? null })
          : await generateFichaTecnicaMicrorganismoPdf({ microId: id, mode: "blob", audience: "b2b", empresaNome: partner?.sellerName ?? null });
      if (result && "blobUrl" in result) {
        if (!current()) { URL.revokeObjectURL(result.blobUrl); return; }
        const after = await catalog.refetch();
        if (!current() || after.error || !after.data?.some(r => r.item_id === id && r.item_tipo === capturedTipo && r.ficha_aprovada)) {
          URL.revokeObjectURL(result.blobUrl); return;
        }
        setPreview({ ...result, nome, scope: access.scope });
      }
    } catch (e: any) {
      if (current()) toast.error(e?.message ?? "Erro ao gerar ficha técnica");
    } finally {
      if (current()) setBusyId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
    };
  }, [preview?.blobUrl]);

  useEffect(() => { setPreview(null); setBusyId(null); }, [access.scope]);

  const loading = tab === "produtos" ? loadingP : loadingM;

  if (catalog.error) return <CatalogoQueryErrorState error={catalog.error} retry={catalog.refetch} busy={catalog.isFetching} />;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Fichas Técnicas</h1>
        <p className="text-sm text-muted-foreground">
          Consulte fichas técnicas completas de todos os produtos e microrganismos da {supplierLabel(partner?.sellerName)}.
        </p>
      </div>

      <CatalogFamilyFilter value={family} onChange={setFamily} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="microrganismos">Microrganismos</TabsTrigger>
        </TabsList>

        <div className="relative mt-3">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nome ou código..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <TabsContent value={tab} className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {filtered.length} {tab === "produtos" ? "produto(s)" : "microrganismo(s)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && (
                <div className="text-center text-muted-foreground py-6 text-sm">Carregando...</div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="text-center text-muted-foreground py-6 text-sm">Nada encontrado.</div>
              )}
              {filtered.map((r: any) => (
                <div key={r.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {r.nome}
                      {r.codigo && <Badge variant="outline" className="text-[10px]">{r.codigo}</Badge>}
                    </div>
                    {r.descricao && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.descricao}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirFicha(r.id, r.nome, r.item_tipo)}
                    disabled={busyId === r.id}
                  >
                    {busyId === r.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4 mr-1" />
                    )}
                    Visualizar
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!visiblePreview}
        onOpenChange={(v) => {
          if (!v && preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
          if (!v) setPreview(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="break-words whitespace-normal pr-6">Ficha técnica — {visiblePreview?.nome}</DialogTitle>
          </DialogHeader>
          {visiblePreview && (
            <iframe
              src={visiblePreview.blobUrl}
              title={visiblePreview.filename}
              className="w-full min-h-0 flex-1 h-[60dvh] rounded-md border"
            />
          )}
          <DialogFooter className="shrink-0 gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>
              Fechar
            </Button>
            {visiblePreview && (
              <a href={visiblePreview.blobUrl} download={visiblePreview.filename}>
                <Button>
                  <Download className="h-4 w-4 mr-1" />
                  Baixar PDF
                </Button>
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
