/**
 * Ações de gestão de um administrador provisionado (Platform Superadmin):
 * editar dados básicos, alterar e-mail e definir responsável principal.
 * Toda regra é validada no servidor; aqui só há UX, confirmação e trava de duplo clique.
 */
import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  mensagemErroPlataforma,
  useAlterarEmailAdmin,
  useDefinirResponsavelPrincipal,
  useEditarAdminEmpresa,
  type ConviteAdminEmpresa,
  type MudancaEmailAdmin,
} from "@/hooks/usePlataformaSaaS";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digitos = (v: string) => v.replace(/\D/g, "");

type Modo = null | "editar" | "email" | "responsavel";

export function AdminGestaoAcoes({
  convite,
  responsavelAtualId,
  mudancaPendente,
}: {
  convite: ConviteAdminEmpresa;
  responsavelAtualId: string | null;
  mudancaPendente: MudancaEmailAdmin | null;
}) {
  const [modo, setModo] = useState<Modo>(null);
  const [nome, setNome] = useState(convite.nome);
  const [telefone, setTelefone] = useState(convite.telefone ?? "");
  const [cpf, setCpf] = useState(convite.cpf_cnpj ?? "");
  const [novoEmail, setNovoEmail] = useState("");
  const [confirmacaoEmail, setConfirmacaoEmail] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [motivo, setMotivo] = useState("");
  const emCurso = useRef(false);

  const editar = useEditarAdminEmpresa();
  const alterarEmail = useAlterarEmailAdmin();
  const definir = useDefinirResponsavelPrincipal();

  const ehResponsavel = !!convite.user_id && convite.user_id === responsavelAtualId;
  const podeSerResponsavel = convite.status === "ativo" && !!convite.user_id && !ehResponsavel;
  const ocupado = convite.status === "processando";
  const cpfBloqueado = convite.status === "ativo" && !!convite.cpf_cnpj;
  const pendente = editar.isPending || alterarEmail.isPending || definir.isPending;

  const abrir = (m: Modo) => {
    setNome(convite.nome); setTelefone(convite.telefone ?? ""); setCpf(convite.cpf_cnpj ?? "");
    setNovoEmail(mudancaPendente?.new_email ?? ""); setMotivo(mudancaPendente?.reason ?? "");
    setConfirmacaoEmail(""); setConfirmado(false); setModo(m);
  };
  const fechar = (aberto: boolean) => { if (!aberto && !emCurso.current) setModo(null); };

  const executar = (fn: (done: () => void) => void) => {
    if (emCurso.current) return;
    emCurso.current = true;
    fn(() => { emCurso.current = false; });
  };

  const motivoOk = motivo.trim().length >= 2;
  const editarValido = nome.trim().length >= 3 && motivoOk &&
    [0, 10, 11].includes(digitos(telefone).length) && [0, 11].includes(digitos(cpf).length);
  const motivoLen = motivo.trim().length;
  const motivoCurto = motivoLen === 1;
  const emailValido = EMAIL_RE.test(novoEmail.trim()) && novoEmail.trim().toLowerCase() !== convite.email.toLowerCase() && novoEmail.trim().toLowerCase() === confirmacaoEmail.trim().toLowerCase() && !motivoCurto && confirmado;

  const salvarEdicao = () => executar((done) => editar.mutate(
    { inviteId: convite.id, nome: nome.trim(), telefone: digitos(telefone), cpf: digitos(cpf), motivo: motivo.trim(), expectedUpdatedAt: convite.updated_at },
    {
      onSuccess: () => { toast.success("Administrador atualizado."); setModo(null); },
      onError: (e) => toast.error(mensagemErroPlataforma(e)),
      onSettled: done,
    },
  ));

  const salvarEmail = (action: "request" | "resend" | "reconcile" | "cancel" = "request") => executar((done) => alterarEmail.mutate(
    { inviteId: convite.id, newEmail: novoEmail, reason: motivo.trim(), idempotencyKey: mudancaPendente?.idempotency_key, action },
    {
      onSuccess: (r) => {
        toast.success(r.status === "completed" ? "E-mail confirmado pelo titular e cadastro sincronizado." : "Aguardando confirmação do titular. O e-mail atual continua válido.");
        setModo(null);
      },
      onError: (e) => toast.error(e.message || "Não foi possível alterar o e-mail."),
      onSettled: done,
    },
  ));

  const salvarResponsavel = () => { if (!convite.user_id) return; executar((done) => definir.mutate(
    { organizationId: convite.organization_id, userId: convite.user_id ?? "", motivo: motivo.trim(), expectedResponsavel: responsavelAtualId },
    {
      onSuccess: () => { toast.success("Responsável principal atualizado."); setModo(null); },
      onError: (e) => toast.error(mensagemErroPlataforma(e)),
      onSettled: done,
    },
  )); };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label={`Gerenciar ${convite.nome}`} disabled={ocupado}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => abrir("editar")}>Editar administrador</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => abrir("email")}>
            {mudancaPendente ? "Gerenciar confirmação de e-mail" : "Alterar e-mail"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!podeSerResponsavel} onSelect={() => abrir("responsavel")}>
            Definir como responsável principal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={modo === "editar"} onOpenChange={fechar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar administrador</DialogTitle>
            <DialogDescription>Empresa, perfis, situação, senha e e-mail não são alterados aqui.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="ga-nome">Nome completo</Label>
              <Input id="ga-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ga-tel">Telefone</Label>
              <Input id="ga-tel" inputMode="numeric" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ga-cpf">CPF</Label>
              <Input id="ga-cpf" inputMode="numeric" value={cpf} disabled={cpfBloqueado} onChange={(e) => setCpf(e.target.value)} />
              {cpfBloqueado && <p className="text-xs text-muted-foreground">CPF de administrador ativo exige correção por fluxo específico.</p>}</div>
            <div className="space-y-1"><Label htmlFor="ga-motivo">Motivo</Label>
              <Textarea id="ga-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pendente} onClick={() => setModo(null)}>Cancelar</Button>
            <Button disabled={!editarValido || pendente} onClick={salvarEdicao}>{editar.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modo === "email"} onOpenChange={fechar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar e-mail de acesso</DialogTitle>
            <DialogDescription>
              O e-mail atual continua válido até o titular confirmar a mudança pelos links recebidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">E-mail atual: <span className="font-mono">{convite.email}</span></p>
            {mudancaPendente && (
              <p className="text-sm text-muted-foreground">Aguardando confirmação do titular para {mudancaPendente.new_email}.</p>
            )}
            <div className="space-y-1"><Label htmlFor="ga-email">Novo e-mail</Label>
              <Input id="ga-email" type="email" value={novoEmail} disabled={!!mudancaPendente} onChange={(e) => setNovoEmail(e.target.value)} /></div>
            {!mudancaPendente && <div className="space-y-1"><Label htmlFor="ga-email-confirmacao">Confirmar novo e-mail</Label><Input id="ga-email-confirmacao" type="email" value={confirmacaoEmail} onChange={(e) => setConfirmacaoEmail(e.target.value)} /></div>}
            <div className="space-y-1"><Label htmlFor="ga-motivo-email">Motivo (opcional)</Label>
              <Textarea id="ga-motivo-email" value={motivo} disabled={!!mudancaPendente} aria-invalid={motivoCurto} onChange={(e) => setMotivo(e.target.value)} />
              {motivoCurto && <p className="text-xs text-destructive">Se informar o motivo, use ao menos 2 caracteres.</p>}</div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirmado} onCheckedChange={(v) => setConfirmado(v === true)} aria-label="Confirmo a alteração" />
              <span>Confirmo que o novo endereço pertence a este administrador.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pendente} onClick={() => setModo(null)}>Cancelar</Button>
            {mudancaPendente ? <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={pendente} onClick={() => salvarEmail("resend")}>Reenviar confirmação</Button>
              <Button disabled={pendente} onClick={() => salvarEmail("reconcile")}>Verificar confirmação</Button>
              <Button variant="outline" disabled={pendente} onClick={() => salvarEmail("cancel")}>Cancelar solicitação</Button>
            </div> : <Button disabled={!emailValido || pendente} onClick={() => salvarEmail()}>{alterarEmail.isPending ? "Enviando…" : "Confirmar alteração"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modo === "responsavel"} onOpenChange={fechar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir como responsável principal</DialogTitle>
            <DialogDescription>{convite.nome} passa a ser o único responsável principal. O anterior continua administrador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1"><Label htmlFor="ga-motivo-resp">Motivo (opcional)</Label>
            <Textarea id="ga-motivo-resp" value={motivo} aria-invalid={motivoCurto} onChange={(e) => setMotivo(e.target.value)} />
            {motivoCurto && <p className="text-xs text-destructive">Se informar o motivo, use ao menos 2 caracteres.</p>}</div>
          <DialogFooter>
            <Button variant="outline" disabled={pendente} onClick={() => setModo(null)}>Cancelar</Button>
            <Button disabled={motivoCurto || pendente} onClick={salvarResponsavel}>{definir.isPending ? "Salvando…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
