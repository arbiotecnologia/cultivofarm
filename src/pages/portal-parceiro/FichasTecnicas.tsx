import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export default function FichasTecnicas() {
  const [tab, setTab] = useState<"produtos" | "microrganismos">("produtos");
  const [busca, setBusca] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: produtos = [], isLoading: loadingP } = useQuery({
    queryKey: ["fichas-tecnicas-produtos-b2b"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, codigo, descricao, product_technical_profiles!inner(status_validacao)")
        .eq("ativo", true)
        .eq("b2b_enabled", true)
        .eq("product_technical_profiles.status_validacao", "aprovado")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: micros = [], isLoading: loadingM } = useQuery({
    queryKey: ["fichas-tecnicas-micros-b2b"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("microrganismos")
        .select("id, nome, codigo, descricao, microorganism_technical_profiles!inner(status_validacao)")
        .eq("ativo", true)
        .eq("b2b_enabled", true)
        .eq("microorganism_technical_profiles.status_validacao", "aprovado")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const [preview, setPreview] = useState<{ blobUrl: string; filename: string; nome: string } | null>(null);

  const abrirFicha = async (id: string, nome: string) => {
    try {
      setBusyId(id);
      const result =
        tab === "produtos"
          ? await generateFichaTecnicaProdutoPdf({ produtoId: id, mode: "blob", audience: "b2b" })
          : await generateFichaTecnicaMicrorganismoPdf({ microId: id, mode: "blob", audience: "b2b" });
      if (result && "blobUrl" in result) {
        setPreview({ ...result, nome });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar ficha técnica");
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
    };
  }, [preview?.blobUrl]);

  const loading = tab === "produtos" ? loadingP : loadingM;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Fichas Técnicas</h1>
        <p className="text-sm text-muted-foreground">
          Consulte fichas técnicas completas de todos os produtos e microrganismos Cultivo Farm.
        </p>
      </div>

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
                    onClick={() => abrirFicha(r.id, r.nome)}
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
        open={!!preview}
        onOpenChange={(v) => {
          if (!v && preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
          if (!v) setPreview(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle className="truncate">Ficha técnica — {preview?.nome}</DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe
              src={preview.blobUrl}
              title={preview.filename}
              className="w-full h-[75vh] rounded-md border"
            />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>
              Fechar
            </Button>
            {preview && (
              <a href={preview.blobUrl} download={preview.filename}>
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
