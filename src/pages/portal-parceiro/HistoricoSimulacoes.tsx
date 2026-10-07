import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, FlaskConical, Eye, Download } from "lucide-react";
import { generateSimulacaoPdf } from "@/lib/pdf/simulacaoPdf";
import { brl } from "@/lib/financial/format";
import { formatDateDisplay } from "@/lib/date-utils";
import { useAuth } from "@/hooks/useAuth";
import {
  usePartnerSimulations,
  usePartnerSimulationItems,
  useDeletePartnerSimulation,
} from "@/hooks/usePartnerSimulations";

export default function HistoricoSimulacoes() {
  const { partner } = useOutletContext<{ partner: any }>();
  const { profile, role, user } = useAuth();
  const { data: allSims = [], isLoading } = usePartnerSimulations(partner?.id);
  const del = useDeletePartnerSimulation(partner?.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: items = [] } = usePartnerSimulationItems(openId);

  // Fase 6: técnico B2B só enxerga simulações que ele mesmo criou.
  const sims = user?.id
    ? allSims.filter((s: any) => s.created_by === user.id)
    : allSims;

  const openSim = sims.find((s) => s.id === openId) ?? null;


  const handleDownload = async (sim: any, itemsList: any[]) => {
    const { blobUrl, filename } = await generateSimulacaoPdf({
      simulacao: sim,
      parceiro_nome: partner?.nome_fantasia ?? partner?.razao_social ?? null,
      baixado_por: {
        nome: profile?.nome,
        email: profile?.email,
        perfil: role,
      },
      itens: itemsList,
    });
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" /> Histórico de Simulações
        </h1>
        <p className="text-sm text-muted-foreground">
          Simulações salvas por você, com observações e itens simulados a preço cheio.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{sims.length} simulação(ões)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && (
            <div className="text-center text-muted-foreground py-6 text-sm">Carregando...</div>
          )}
          {!isLoading && sims.length === 0 && (
            <div className="text-center text-muted-foreground py-6 text-sm">
              Nenhuma simulação salva ainda. Monte uma em <strong>Simulação</strong>.
            </div>
          )}
          {sims.map((s) => (
            <div
              key={s.id}
              className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {s.titulo ?? "Simulação"}
                  <Badge variant="outline" className="text-[10px]">
                    {s.items_count ?? 0} item(s)
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateDisplay(s.created_at)} {role !== "parceiro_b2b_tecnico" && <> · Total: <strong>{brl(Number(s.total_cheio))}</strong></>}
                  {s.cliente_nome_snapshot && <> · Produtor: <strong>{s.cliente_nome_snapshot}</strong></>}
                  {s.cultura && <> · Cultura: {s.cultura}</>}
                </div>
                {s.observacoes && (
                  <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-3">
                    {s.observacoes}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setOpenId(s.id)}>
                  <Eye className="h-4 w-4 mr-1" /> Detalhes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Excluir esta simulação?")) del.mutate(s.id);
                  }}
                  title="Excluir simulação"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openSim?.titulo ?? "Simulação"}</DialogTitle>
          </DialogHeader>
          {openSim && (
            <div className="space-y-3 text-sm">
              {role !== "parceiro_b2b_tecnico" && <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => handleDownload(openSim, items as any[])}>
                  <Download className="h-4 w-4 mr-1" /> Baixar PDF
                </Button>
              </div>}
              <div className="text-xs text-muted-foreground">
                Criada em {formatDateDisplay(openSim.created_at)}
                {role !== "parceiro_b2b_tecnico" && <> · Total <strong>{brl(Number(openSim.total_cheio))}</strong></>}
              </div>
              {openSim.observacoes && (
                <div className="rounded-md border p-2 bg-muted/40 whitespace-pre-wrap text-xs">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Observações</div>
                  {openSim.observacoes}
                </div>
              )}
              <div className="border rounded-md divide-y">
                {items.length === 0 && (
                  <div className="p-3 text-center text-muted-foreground text-xs">Sem itens.</div>
                )}
                {items.map((it: any) => (
                  <div key={it.id} className="p-2 flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{it.nome}</div>
                      <div className="text-muted-foreground">
                        {it.item_tipo === "microrganismo" ? "Microrganismo" : "Produto"} ·{" "}
                        {Number(it.quantidade)} {role !== "parceiro_b2b_tecnico" && <>× {brl(Number(it.valor_unitario_cheio))}</>}
                      </div>
                    </div>
                    {role !== "parceiro_b2b_tecnico" && <div className="font-medium">{brl(Number(it.subtotal))}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
