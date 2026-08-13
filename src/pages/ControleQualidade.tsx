import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { AuxiliaryScreenBanner } from "@/components/AuxiliaryScreenBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";
import { formatDateDisplay } from "@/lib/date-utils";

interface CQ {
  id: string;
  ph: number | null;
  aparencia: string | null;
  odor: string | null;
  concentracao: number | null;
  contaminacao: string | null;
  data_analise: string;
  responsavel: string | null;
  resultado: string | null;
  lotes?: { codigo_lote: string; programacao_id: string | null; produtos?: { nome: string } | null } | null;
}

export default function ControleQualidade() {
  const isMobile = useIsMobile();
  const [cqs, setCqs] = useState<CQ[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCq, setSelectedCq] = useState<CQ | null>(null);

  const fetchAll = async () => {
    const { data } = await supabase
      .from("controle_qualidade")
      .select("*, lotes(codigo_lote, programacao_id, produtos(nome))")
      .order("created_at", { ascending: false });
    if (data) setCqs(data as CQ[]);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = cqs.filter((c) =>
    (c.lotes as any)?.codigo_lote?.toLowerCase().includes(search.toLowerCase()) ||
    c.responsavel?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <AuxiliaryScreenBanner
        title="Consulta de laudos de Controle de Qualidade"
        description="Esta tela mostra o histórico de análises e laudos por lote. Para registrar um novo resultado de CQ, use o Cockpit Laboratório — o avanço da esteira é feito por lá."
      />
      <PageHeader
        title="Controle de Qualidade"
        description="Consulta de laudos por lote"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input placeholder="Buscar por lote ou responsável..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-sm" />
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "p-3" : "p-0 sm:p-6 sm:pt-0"}>
          <ResponsiveTable
            mobileCards={
              filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">Nenhuma análise registrada</div>
              ) : (
                filtered.map((c) => (
                  <MobileCard
                    key={c.id}
                    title={(c.lotes as any)?.codigo_lote || "—"}
                    subtitle={(c.lotes as any)?.produtos?.nome || "—"}
                    status={
                      <Badge variant={c.resultado === "aprovado" ? "default" : "destructive"} className={c.resultado === "aprovado" ? "bg-status-aprovado h-5 px-1.5 text-[10px]" : "h-5 px-1.5 text-[10px]"}>
                        {c.resultado === "aprovado" ? "Aprovado" : "Reprovado"}
                      </Badge>
                    }
                    content={[
                      { label: "pH", value: c.ph ?? "—" },
                      { label: "Concent.", value: formatConcentracaoDisplay(c.concentracao) },
                      { label: "Responsável", value: c.responsavel || "—" },
                      { label: "Data", value: formatDateDisplay(c.data_analise) },
                    ]}
                  />
                ))
              )
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>pH</TableHead>
                  <TableHead>Aparência</TableHead>
                  <TableHead>Contaminação</TableHead>
                  <TableHead>Concentração</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhuma análise registrada</TableCell></TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono-data font-medium">{(c.lotes as any)?.codigo_lote || "—"}</TableCell>
                    <TableCell>{(c.lotes as any)?.produtos?.nome || "—"}</TableCell>
                    <TableCell className="font-mono-data">{c.ph ?? "—"}</TableCell>
                    <TableCell>{c.aparencia || "—"}</TableCell>
                     <TableCell>{c.contaminacao || "—"}</TableCell>
                    <TableCell className="font-mono-data">{formatConcentracaoDisplay(c.concentracao)}</TableCell>
                    <TableCell>{c.responsavel || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.resultado === "aprovado" ? "default" : "destructive"} className={c.resultado === "aprovado" ? "bg-status-aprovado" : ""}>
                        {c.resultado === "aprovado" ? "Aprovado" : "Reprovado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedCq(c)}>
                        Laudo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      <Dialog open={!!selectedCq} onOpenChange={(o) => !o && setSelectedCq(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-status-aprovado" />
              Laudo de Análise Técnica
            </DialogTitle>
          </DialogHeader>
          {selectedCq && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 border-b pb-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Lote</p>
                  <p className="text-lg font-mono-data">{(selectedCq.lotes as any)?.codigo_lote}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Produto</p>
                  <p className="text-lg">{(selectedCq.lotes as any)?.produtos?.nome}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Data da Análise</p>
                  <p className="text-sm">{formatDateDisplay(selectedCq.data_analise)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Responsável</p>
                  <p className="text-sm">{selectedCq.responsavel || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">pH</p>
                  <p className="text-xl font-bold">{selectedCq.ph ?? "—"}</p>
                </div>
                 <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Concentração</p>
                  <p className="text-xl font-bold">{formatConcentracaoDisplay(selectedCq.concentracao)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Aparência</p>
                  <p className="text-sm font-medium">{selectedCq.aparencia || "Normal"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Odor</p>
                  <p className="text-sm font-medium">{selectedCq.odor || "Característico"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Contaminação</p>
                  <p className={`text-sm font-bold ${selectedCq.contaminacao?.toLowerCase().includes("presen") ? "text-destructive" : "text-status-aprovado"}`}>
                    {selectedCq.contaminacao || "Ausente"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Parecer Final</p>
                  <p className={`text-xl font-black uppercase ${selectedCq.resultado === "aprovado" ? "text-status-aprovado" : "text-destructive"}`}>
                    {selectedCq.resultado === "aprovado" ? "APROVADO PARA USO" : "REPROVADO / REPROCESSAR"}
                  </p>
                </div>
                {selectedCq.resultado === "aprovado" ? <CheckCircle2 className="h-10 w-10 text-status-aprovado" /> : <XCircle className="h-10 w-10 text-destructive" />}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
