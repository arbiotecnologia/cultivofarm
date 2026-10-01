/**
 * Nova Empresa (Superadmin). Criação via RPC platform_create_organization
 * (servidor valida superadmin, CNPJ normalizado único e plano). Estado inicial
 * aguardando_ativacao, ou rascunho quando sem CNPJ.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  mensagemErroPlataforma,
  useAlterarStatusEmpresa,
  useCriarEmpresa,
  useOrganizacoesSaaS,
  usePlanosSaaS,
} from "@/hooks/usePlataformaSaaS";
import { ORG_STATUS_LABEL, OrgStatus, cnpjValido, normalizarCnpj, transicaoPermitida } from "@/lib/saas/orgOnboarding";

const ACOES_SUPERADMIN: OrgStatus[] = ["aguardando_ativacao", "rascunho", "suspensa", "ativa", "cancelada"];

export default function PlataformaEmpresas() {
  const orgs = useOrganizacoesSaaS();
  const planos = usePlanosSaaS();
  const criar = useCriarEmpresa();
  const alterar = useAlterarStatusEmpresa();
  const [nome, setNome] = useState("");
  const [fantasia, setFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState("");
  const [rascunho, setRascunho] = useState(false);

  const semCnpj = !normalizarCnpj(cnpj);
  const erroCnpj = !semCnpj && !cnpjValido(cnpj) ? "CNPJ inválido" : null;
  const podeEnviar =
    nome.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && !!plano && !erroCnpj && (!semCnpj || rascunho);

  const enviar = async () => {
    try {
      await criar.mutateAsync({ nome, nomeFantasia: fantasia, cnpj, email, planKey: plano, rascunho: semCnpj ? true : rascunho });
      toast.success("Empresa criada. Agora convide o Responsável Principal na aba Administradores.");
      setNome(""); setFantasia(""); setCnpj(""); setEmail(""); setRascunho(false);
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    }
  };

  const mudar = async (org: string, status: OrgStatus) => {
    const motivo = window.prompt(`Motivo para alterar para "${ORG_STATUS_LABEL[status]}" (mín. 5 caracteres):`);
    if (!motivo) return;
    try {
      await alterar.mutateAsync({ org, status, motivo });
      toast.success("Situação atualizada.");
    } catch (e) {
      toast.error(mensagemErroPlataforma(e));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova empresa</CardTitle>
          <CardDescription>
            A empresa é criada antes do convite. O administrador completa o cadastro no primeiro acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="emp-nome">Razão social ou nome provisório *</Label>
            <Input id="emp-nome" value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="emp-fantasia">Nome fantasia</Label>
            <Input id="emp-fantasia" value={fantasia} maxLength={200} onChange={(e) => setFantasia(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="emp-cnpj">CNPJ (se disponível)</Label>
            <Input id="emp-cnpj" value={cnpj} maxLength={18} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
            {erroCnpj && <p className="text-xs text-destructive">{erroCnpj}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="emp-email">E-mail corporativo *</Label>
            <Input id="emp-email" type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Plano *</Label>
            <Select value={plano} onValueChange={setPlano}>
              <SelectTrigger aria-label="Plano"><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
              <SelectContent>
                {(planos.data ?? []).filter((p) => p.active).map((p) => (
                  <SelectItem key={p.id} value={p.key}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox id="emp-rascunho" checked={semCnpj || rascunho} disabled={semCnpj} onCheckedChange={(v) => setRascunho(v === true)} />
            <Label htmlFor="emp-rascunho" className="font-normal">
              Salvar como rascunho {semCnpj && "(obrigatório sem CNPJ)"}
            </Label>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={enviar} disabled={!podeEnviar || criar.isPending}>
              {criar.isPending ? "Criando…" : "Criar empresa"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresas</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orgs.data ?? []).map((o) => {
                const st = o.status as OrgStatus;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">
                      {o.nome}
                      {o.nome_fantasia && <span className="block text-xs text-muted-foreground">{o.nome_fantasia}</span>}
                    </TableCell>
                    <TableCell>{o.cnpj ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{ORG_STATUS_LABEL[st] ?? o.status}</Badge></TableCell>
                    <TableCell className="space-x-1">
                      {ACOES_SUPERADMIN.filter((a) => transicaoPermitida(st, a) && !(st === "onboarding" && a === "ativa")).map((a) => (
                        <Button key={a} size="sm" variant="ghost" disabled={alterar.isPending} onClick={() => mudar(o.id, a)}>
                          {ORG_STATUS_LABEL[a]}
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
