/**
 * Convite e provisionamento do administrador de empresa pelo Superadmin.
 *
 * A criação do acesso é feita exclusivamente no servidor (Edge Function
 * `platform-invite-org-admin` + RPC `platform_register_org_admin`), que
 * valida o papel de plataforma. Aqui não há atribuição de papéis pelo cliente
 * e o superadmin NÃO vira administrador operacional.
 */
import { useEffect, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useConvidarAdminEmpresa,
  useConvitesAdminEmpresa,
  useOrganizacoesSaaS,
  type ResultadoConvite,
} from "@/hooks/usePlataformaSaaS";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const mascaraCpf = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const mascaraTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

const dataHora = (valor: string) => {
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const STATUS_PROVISIONAMENTO = {
  processando: "Criando acesso",
  falhou: "Falhou — tentar novamente",
  pendente: "Convite enviado",
  ativo: "Ativo",
} as const;

async function copiar(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${rotulo} copiado.`);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto manualmente.");
  }
}

export default function PlataformaAdmins({ organizationIdInicial = null }: { organizationIdInicial?: string | null }) {
  const orgs = useOrganizacoesSaaS();
  const convites = useConvitesAdminEmpresa();
  const convidar = useConvidarAdminEmpresa();

  const [org, setOrg] = useState(organizationIdInicial ?? "");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [modo, setModo] = useState<"link" | "senha_temporaria">("link");
  const [responsavel, setResponsavel] = useState(true);
  const [resultado, setResultado] = useState<ResultadoConvite | null>(null);
  const [retryAmbiguo, setRetryAmbiguo] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);

  const nomeOrg = (id: string) => orgs.data?.find((o) => o.id === id)?.nome ?? id.slice(0, 8);
  const envioAmbiguo = (c: (typeof convites.data extends Array<infer T> ? T : never)) =>
    c.email_delivery_status === "ambiguous" || [
      "email_unknown_error",
      "email_send_ambiguous",
      "email_accept_persistence_failed",
      "email_timeout",
      "email_network_error",
      "email_send_crash",
      "email_delivery_setup_failed",
    ].includes(c.email_last_error_code ?? "");

  useEffect(() => {
    if (organizationIdInicial) setOrg(organizationIdInicial);
  }, [organizationIdInicial]);

  const valido =
    !!org && nome.trim().length >= 3 && EMAIL_RE.test(email.trim()) &&
    (cpf.replace(/\D/g, "").length === 0 || cpf.replace(/\D/g, "").length === 11) &&
    (telefone.replace(/\D/g, "").length === 0 || telefone.replace(/\D/g, "").length >= 10);

  const enviar = (confirmAmbiguousEmailRetry = false) => {
    setResultado(null);
    convidar.mutate(
      {
        organizationId: org,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        cpf: cpf.replace(/\D/g, ""),
        telefone: telefone.replace(/\D/g, ""),
        modo,
        responsavelPrincipal: responsavel,
        confirmAmbiguousEmailRetry,
      },
      {
        onSuccess: (r) => {
          setResultado(r);
          setNome("");
          setEmail("");
          setCpf("");
          setTelefone("");
          toast.success(r.email_status === "accepted" ? "Convite aceito pelo servidor de e-mail." : "Acesso do administrador criado.");
        },
        onError: () => toast.error("Não foi possível concluir o convite. Confira o status antes de tentar novamente."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convidar administrador da empresa</CardTitle>
          <CardDescription>
            O administrador recebe acesso somente à empresa escolhida. Seu acesso de plataforma
            continua separado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={org} onValueChange={setOrg}>
                <SelectTrigger aria-label="Empresa">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.data?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-nome">Nome completo</Label>
              <Input
                id="admin-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do responsável"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">E-mail de acesso e convite</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com.br"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-cpf">CPF (opcional)</Label>
              <Input
                id="admin-cpf"
                value={cpf}
                onChange={(e) => setCpf(mascaraCpf(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-tel">Telefone (opcional)</Label>
              <Input
                id="admin-tel"
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Forma de acesso</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as typeof modo)}>
                <SelectTrigger aria-label="Forma de acesso">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Link de convite (ele cria a senha)</SelectItem>
                  <SelectItem value="senha_temporaria">
                    Senha temporária (troca no 1º acesso)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={responsavel}
              onCheckedChange={(v) => setResponsavel(v === true)}
              aria-label="Responsável principal"
            />
            <span>
              Registrar como <strong>Responsável Principal</strong> da empresa perante o sistema.
            </span>
          </label>

          <Button disabled={!valido || convidar.isPending} onClick={() => retryAmbiguo ? setConfirmacaoAberta(true) : enviar()}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {convidar.isPending ? "Criando acesso…" : "Gerar acesso"}
          </Button>

          {resultado && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-3">
              <p className="text-sm font-medium">
                {resultado.email_status === "accepted"
                  ? "Convite entregue ao servidor de e-mail."
                  : "Acesso criado. Envie a senha ao responsável por um canal seguro:"}
              </p>
              {resultado.senha_temporaria && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Senha temporária: <span className="font-mono">{resultado.senha_temporaria}</span>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copiar(resultado.senha_temporaria!, "Senha temporária")}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copiar senha temporária
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Esta senha aparece apenas agora. Ele será obrigado a trocá-la no primeiro acesso.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Administradores provisionados</CardTitle>
          <CardDescription>Convites já enviados por empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          {convites.isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          )}
          {convites.isError && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Não foi possível carregar a lista agora.
            </p>
          )}
          {convites.data && convites.data.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum administrador provisionado ainda.
            </p>
          )}
          {convites.data && convites.data.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Forma de acesso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Última atualização</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convites.data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{nomeOrg(c.organization_id)}</TableCell>
                      <TableCell>
                        {c.nome}
                        {c.responsavel_principal && (
                          <Badge variant="secondary" className="ml-2">
                            Responsável
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.email}</TableCell>
                      <TableCell>
                        {c.modo_acesso === "link" ? "Link de convite" : "Senha temporária"}
                      </TableCell>
                      <TableCell><Badge variant={c.status === "falhou" ? "destructive" : "outline"}>{envioAmbiguo(c) ? "Envio não confirmado" : STATUS_PROVISIONAMENTO[c.status] ?? c.status}</Badge></TableCell>
                      <TableCell>{dataHora(c.updated_at || c.created_at)}</TableCell>
                      <TableCell>
                        {c.status === "falhou" || envioAmbiguo(c) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={convidar.isPending}
                            onClick={() => {
                              setOrg(c.organization_id); setNome(c.nome); setEmail(c.email);
                              setCpf(c.cpf_cnpj ? mascaraCpf(c.cpf_cnpj) : "");
                              setTelefone(c.telefone ? mascaraTelefone(c.telefone) : "");
                              setModo(c.modo_acesso); setResponsavel(c.responsavel_principal);
                              setRetryAmbiguo(envioAmbiguo(c));
                              document.getElementById("admin-nome")?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >Preparar nova tentativa</Button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={confirmacaoAberta} onOpenChange={setConfirmacaoAberta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar reenvio do convite</AlertDialogTitle>
            <AlertDialogDescription>Confirme que verificou a caixa de entrada e não recebeu o convite. O reenvio pode gerar uma segunda mensagem se a entrega anterior tiver ocorrido.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => enviar(true)}>Confirmar e reenviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
