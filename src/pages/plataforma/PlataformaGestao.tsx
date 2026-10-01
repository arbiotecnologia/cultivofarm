/**
 * Fase S3 — gestão de exceções por empresa e troca de plano/situação.
 * Toda escrita passa por RPCs `platform_*` (superadmin, motivo obrigatório).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  mensagemErroPlataforma,
  useAlterarAssinatura,
  useCriarExcecao,
  useEncerrarExcecao,
  useExcecoesSaaS,
  useModulosFeaturesSaaS,
  useOrganizacoesSaaS,
  usePlanosSaaS,
} from "@/hooks/usePlataformaSaaS";

const STATUS = [
  ["TRIAL", "Período de teste"],
  ["ACTIVE", "Ativa"],
  ["PAST_DUE", "Pagamento em atraso"],
  ["SUSPENDED", "Suspensa"],
  ["CANCELLED", "Cancelada"],
  ["EXPIRED", "Expirada"],
] as const;

const motivoOk = (m: string) => m.trim().length >= 5;

export function AlterarAssinaturaCard() {
  const orgs = useOrganizacoesSaaS();
  const planos = usePlanosSaaS();
  const alterar = useAlterarAssinatura();
  const [org, setOrg] = useState("");
  const [plano, setPlano] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [motivo, setMotivo] = useState("");

  const enviar = () =>
    alterar.mutate(
      { organizationId: org, planKey: plano, status, reason: motivo.trim() },
      {
        onSuccess: () => {
          toast.success("Assinatura atualizada e registrada no histórico.");
          setMotivo("");
        },
        onError: (e) => toast.error(mensagemErroPlataforma(e)),
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alterar plano ou situação</CardTitle>
        <CardDescription>A mudança fica registrada no histórico com o motivo.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Select value={org} onValueChange={setOrg}>
          <SelectTrigger aria-label="Empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            {orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={plano} onValueChange={setPlano}>
          <SelectTrigger aria-label="Plano"><SelectValue placeholder="Plano" /></SelectTrigger>
          <SelectContent>
            {planos.data?.filter((p) => p.active).map((p) => (
              <SelectItem key={p.id} value={p.key}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Motivo (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <div className="sm:col-span-2">
          <Button disabled={!org || !plano || !motivoOk(motivo) || alterar.isPending} onClick={enviar}>
            {alterar.isPending ? "Salvando…" : "Salvar alteração"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExcecoesTab() {
  const orgs = useOrganizacoesSaaS();
  const catalogo = useModulosFeaturesSaaS();
  const excecoes = useExcecoesSaaS();
  const criar = useCriarExcecao();
  const encerrar = useEncerrarExcecao();
  const [org, setOrg] = useState("");
  const [feature, setFeature] = useState("");
  const [modo, setModo] = useState<"GRANT" | "REVOKE">("GRANT");
  const [ate, setAte] = useState("");
  const [motivo, setMotivo] = useState("");

  const nomeOrg = (id: string) => orgs.data?.find((o) => o.id === id)?.nome ?? id.slice(0, 8);
  const nomeFeat = (id: string) => catalogo.data?.features.find((f) => f.id === id)?.name ?? id.slice(0, 8);

  const enviar = () =>
    criar.mutate(
      {
        organizationId: org,
        featureKey: feature,
        mode: modo,
        reason: motivo.trim(),
        endsAt: ate ? new Date(`${ate}T23:59:59-03:00`).toISOString() : null,
      },
      {
        onSuccess: () => {
          toast.success("Exceção criada.");
          setMotivo("");
          setAte("");
        },
        onError: (e) => toast.error(mensagemErroPlataforma(e)),
      },
    );

  const encerrarExcecao = (id: string) => {
    const r = window.prompt("Motivo do encerramento (mínimo 5 caracteres):") ?? "";
    if (!motivoOk(r)) return;
    encerrar.mutate(
      { id, reason: r.trim() },
      {
        onSuccess: () => toast.success("Exceção encerrada."),
        onError: (e) => toast.error(mensagemErroPlataforma(e)),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova exceção</CardTitle>
          <CardDescription>
            Libera ou retira uma funcionalidade de uma empresa, acima do que o plano dela define.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Select value={org} onValueChange={setOrg}>
            <SelectTrigger aria-label="Empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              {orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={feature} onValueChange={setFeature}>
            <SelectTrigger aria-label="Funcionalidade"><SelectValue placeholder="Funcionalidade" /></SelectTrigger>
            <SelectContent>
              {catalogo.data?.features.map((f) => <SelectItem key={f.id} value={f.key}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={modo} onValueChange={(v) => setModo(v as "GRANT" | "REVOKE")}>
            <SelectTrigger aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GRANT">Liberar</SelectItem>
              <SelectItem value="REVOKE">Retirar</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" aria-label="Válida até (opcional)" value={ate} onChange={(e) => setAte(e.target.value)} />
          <Input className="sm:col-span-2" placeholder="Motivo (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="sm:col-span-2">
            <Button disabled={!org || !feature || !motivoOk(motivo) || criar.isPending} onClick={enviar}>
              {criar.isPending ? "Salvando…" : "Criar exceção"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exceções registradas</CardTitle>
          <CardDescription>Não podem ser apagadas — apenas encerradas, com motivo.</CardDescription>
        </CardHeader>
        <CardContent>
          {excecoes.isError && <p className="text-sm text-muted-foreground">Não foi possível carregar.</p>}
          {excecoes.data && excecoes.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma exceção registrada.</p>
          )}
          {excecoes.data && excecoes.data.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Funcionalidade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Até</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excecoes.data.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>{nomeOrg(x.organization_id)}</TableCell>
                      <TableCell>{nomeFeat(x.feature_id)}</TableCell>
                      <TableCell>
                        <Badge variant={x.mode === "GRANT" ? "default" : "secondary"}>
                          {x.mode === "GRANT" ? "Liberar" : "Retirar"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {x.ends_at ? new Date(x.ends_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Sem prazo"}
                      </TableCell>
                      <TableCell>{x.reason}</TableCell>
                      <TableCell>
                        {x.ended_at ? (
                          <Badge variant="outline">Encerrada</Badge>
                        ) : (
                          <Button size="sm" variant="outline" disabled={encerrar.isPending} onClick={() => encerrarExcecao(x.id)}>
                            Encerrar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
