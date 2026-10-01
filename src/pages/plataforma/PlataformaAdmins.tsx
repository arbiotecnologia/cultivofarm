/**
 * Convite e provisionamento do administrador de empresa pelo Superadmin.
 *
 * A criação do acesso é feita exclusivamente no servidor (Edge Function
 * `platform-invite-org-admin` + RPC `platform_register_org_admin`), que
 * valida o papel de plataforma. Aqui não há atribuição de papéis pelo cliente
 * e o superadmin NÃO vira administrador operacional.
 */
import { useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const cpfMascarado = (v: string | null) => {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "—";
};

const dataHora = (valor: string) => {
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

async function copiar(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${rotulo} copiado.`);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto manualmente.");
  }
}

export default function PlataformaAdmins() {
  const orgs = useOrganizacoesSaaS();
  const convites = useConvitesAdminEmpresa();
  const convidar = useConvidarAdminEmpresa();

  const [org, setOrg] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [modo, setModo] = useState<"link" | "senha_temporaria">("link");
  const [responsavel, setResponsavel] = useState(true);
  const [resultado, setResultado] = useState<ResultadoConvite | null>(null);

  const nomeOrg = (id: string) => orgs.data?.find((o) => o.id === id)?.nome ?? id.slice(0, 8);

  const valido =
    !!org && nome.trim().length >= 3 && EMAIL_RE.test(email.trim()) &&
    (cpf.replace(/\D/g, "").length === 0 || cpf.replace(/\D/g, "").length === 11) &&
    (telefone.replace(/\D/g, "").length === 0 || telefone.replace(/\D/g, "").length >= 10);

  const enviar = () => {
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
      },
      {
        onSuccess: (r) => {
          setResultado(r);
          setNome("");
          setEmail("");
          setCpf("");
          setTelefone("");
          toast.success("Acesso do administrador criado.");
        },
        onError: (e) => toast.error(e.message),
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
              <Label htmlFor="admin-email">E-mail corporativo</Label>
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

          <Button disabled={!valido || convidar.isPending} onClick={enviar}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {convidar.isPending ? "Criando acesso…" : "Gerar acesso"}
          </Button>

          {resultado && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-3">
              <p className="text-sm font-medium">Acesso criado. Envie ao responsável:</p>
              {resultado.action_link && (
                <div className="space-y-1">
                  <p className="break-all text-xs text-muted-foreground">{resultado.action_link}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copiar(resultado.action_link!, "Link")}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copiar link de convite
                  </Button>
                </div>
              )}
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
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Acesso</TableHead>
                    <TableHead>Quando</TableHead>
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
                      <TableCell>{c.telefone ?? "—"}</TableCell>
                      <TableCell>{cpfMascarado(c.cpf_cnpj)}</TableCell>
                      <TableCell>
                        {c.modo_acesso === "link" ? "Link de convite" : "Senha temporária"}
                      </TableCell>
                      <TableCell>{dataHora(c.created_at)}</TableCell>
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
