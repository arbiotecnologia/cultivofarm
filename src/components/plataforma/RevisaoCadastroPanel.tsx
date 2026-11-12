/**
 * Revisão de cadastro da empresa (Superadmin de Plataforma). A autoridade é do servidor:
 * a fila, a aprovação e a remessa à revisão são RPCs que revalidam o papel e registram auditoria.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mensagemErroPlataforma, useAprovarRevisaoCadastro, useRemeterEmpresaRevisao, useRevisoesCadastro } from "@/hooks/usePlataformaSaaS";
import { MOTIVO_REVISAO_LABEL } from "@/lib/saas/orgOnboarding";

type Acao = "aprovar" | "remeter";

export function RevisaoCadastroPanel({ organizationId, status, onConcluido }: { organizationId: string; status: string; onConcluido?: () => void }) {
  const revisoes = useRevisoesCadastro(organizationId, status === "aguardando_revisao");
  const aprovar = useAprovarRevisaoCadastro();
  const remeter = useRemeterEmpresaRevisao();
  const [acao, setAcao] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");
  const enviando = useRef(false);
  const pendente = revisoes.data?.[0] ?? null;

  if (status !== "aguardando_revisao" && status !== "ativa") return null;

  const confirmar = async () => {
    if (!acao || enviando.current || motivo.trim().length < 5) return;
    enviando.current = true;
    try {
      const r = acao === "aprovar"
        ? await aprovar.mutateAsync({ org: organizationId, motivo: motivo.trim() })
        : await remeter.mutateAsync({ org: organizationId, motivo: motivo.trim() });
      toast.success(acao === "aprovar"
        ? (r.idempotent ? "Revisão já estava aprovada." : "Cadastro aprovado. Empresa liberada.")
        : (r.idempotent ? "Empresa já estava em revisão." : "Empresa remetida à revisão."));
      setAcao(null); setMotivo("");
      onConcluido?.();
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    } finally {
      enviando.current = false;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Revisão de cadastro</CardTitle>
        <CardDescription>
          {status === "aguardando_revisao"
            ? "A empresa só é liberada (inclusive a Central Fiscal) após aprovação explícita."
            : "Remeta a empresa à revisão se o cadastro precisar ser conferido novamente. O acesso fica bloqueado até a aprovação."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "aguardando_revisao" && revisoes.isLoading && <p className="text-sm text-muted-foreground">Carregando revisão…</p>}
        {status === "aguardando_revisao" && revisoes.isError && <p className="text-sm text-muted-foreground">Não foi possível carregar a revisão.</p>}
        {pendente && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Motivo</dt><dd>{MOTIVO_REVISAO_LABEL[pendente.motivo_codigo] ?? pendente.motivo_codigo}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Enviado em</dt><dd>{new Date(pendente.submetido_em).toLocaleString("pt-BR")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Razão social informada</dt><dd className="break-words">{pendente.dados?.razao_social ?? pendente.razao_social ?? "Não informado"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Consulta oficial</dt><dd className="break-words">
              {pendente.evidencia
                ? <>{pendente.evidencia.razao_social ?? "—"} <Badge variant="outline">{pendente.evidencia.situacao_cadastral ?? "—"}</Badge>{!pendente.evidencia.vigente && <Badge variant="secondary" className="ml-1">Expirada</Badge>}</>
                : <Badge variant="secondary">Sem consulta registrada</Badge>}
            </dd></div>
            {pendente.observacao && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Observação</dt><dd className="break-words">{pendente.observacao}</dd></div>}
          </dl>
        )}
        <div className="flex flex-wrap gap-2">
          {status === "aguardando_revisao" && <Button className="min-h-11" disabled={!pendente} onClick={() => setAcao("aprovar")}>Aprovar cadastro</Button>}
          {status === "ativa" && <Button variant="outline" className="min-h-11" onClick={() => setAcao("remeter")}>Remeter à revisão</Button>}
        </div>
      </CardContent>
      <Dialog open={acao !== null} onOpenChange={(o) => { if (!o) { setAcao(null); setMotivo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{acao === "aprovar" ? "Aprovar cadastro" : "Remeter à revisão"}</DialogTitle>
            <DialogDescription>Informe o motivo (mínimo 5 caracteres). A decisão fica registrada no histórico.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="rev-motivo">Motivo *</Label>
            <Textarea id="rev-motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAcao(null); setMotivo(""); }}>Cancelar</Button>
            <Button disabled={motivo.trim().length < 5 || aprovar.isPending || remeter.isPending} onClick={() => void confirmar()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
