/**
 * Ações de gestão de um administrador provisionado (Platform Superadmin):
 * editar dados básicos, alterar e-mail e gerenciar acesso.
 * Toda regra é validada no servidor; aqui só há UX, confirmação e trava de duplo clique.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminAcessoSection } from "./AdminAcessoDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  mascararEmail,
  mensagemErroPlataforma,
  type useConvidarAdminEmpresa,
  useAlterarEmailAdmin,
  useEditarAdminEmpresa,
  type ConviteAdminEmpresa,
  type MudancaEmailAdmin,
} from "@/hooks/usePlataformaSaaS";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digitos = (v: string) => v.replace(/\D/g, "");

type Modo = "editar" | "email" | "acesso";

export function AdminGestaoAcoes({
  convite,
  mudancaPendente,
  empresaNome,
  convidar,
}: {
  convite: ConviteAdminEmpresa;
  mudancaPendente: MudancaEmailAdmin | null;
  empresaNome: string;
  convidar: Pick<ReturnType<typeof useConvidarAdminEmpresa>, "mutate" | "isPending">;
}) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<Modo>("editar");
  const [accessBusy, setAccessBusy] = useState(false);
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

  const ocupado = convite.status === "processando";
  const cpfBloqueado = convite.status === "ativo" && !!convite.cpf_cnpj;
  const pendente = editar.isPending || alterarEmail.isPending || accessBusy || convidar.isPending;

  const abrir = (m: Modo) => {
    setNome(convite.nome); setTelefone(convite.telefone ?? ""); setCpf(convite.cpf_cnpj ?? "");
    setNovoEmail(mudancaPendente?.new_email ?? ""); setMotivo(mudancaPendente?.reason ?? "");
    setConfirmacaoEmail(""); setConfirmado(false); setModo(m); setOpen(true);
  };
  const fechar = (aberto: boolean) => { if (!aberto && !emCurso.current && !pendente) setOpen(false); };

  const executar = (fn: (done: () => void) => void) => {
    if (emCurso.current) return;
    emCurso.current = true;
    fn(() => { emCurso.current = false; });
  };

  const motivoLen = motivo.trim().length;
  const motivoCurto = motivoLen === 1;
  const editarValido = nome.trim().length >= 3 && !motivoCurto &&
    [0, 10, 11].includes(digitos(telefone).length) && [0, 11].includes(digitos(cpf).length);
  const reenvioAmbiguo = ["sending", "ambiguous"].includes(mudancaPendente?.confirmation_delivery_status ?? "");
  const reenvioCooldown = !!mudancaPendente?.confirmation_next_attempt_at && Date.parse(mudancaPendente.confirmation_next_attempt_at) > Date.now();
  const emailValido = EMAIL_RE.test(novoEmail.trim()) && novoEmail.trim().toLowerCase() !== convite.email.toLowerCase() && novoEmail.trim().toLowerCase() === confirmacaoEmail.trim().toLowerCase() && !motivoCurto && confirmado;

  const salvarEdicao = () => executar((done) => editar.mutate(
    { inviteId: convite.id, nome: nome.trim(), telefone: digitos(telefone), cpf: digitos(cpf), motivo: motivo.trim(), expectedUpdatedAt: convite.updated_at },
    {
      onSuccess: () => { toast.success("Administrador atualizado."); setOpen(false); },
      onError: (e) => toast.error(mensagemErroPlataforma(e)),
      onSettled: done,
    },
  ));

  const salvarEmail = (action: "request" | "resend" | "reconcile" = "request") => executar((done) => alterarEmail.mutate(
    { inviteId: convite.id, newEmail: novoEmail, reason: motivo.trim(), idempotencyKey: mudancaPendente?.idempotency_key, action, confirmAmbiguousRetry: action === "resend" && reenvioAmbiguo && confirmado },
    {
      onSuccess: (r) => {
        toast.success(r.status === "completed" ? "E-mail confirmado pelo titular e cadastro sincronizado." : "Aguardando confirmação do titular. O e-mail atual continua válido.");
        setOpen(false);
      },
      onError: (e) => toast.error(e.message || "Não foi possível alterar o e-mail."),
      onSettled: done,
    },
  ));

  return (
    <>
      <Button size="sm" variant="outline" className="min-h-11" disabled={ocupado} onClick={() => abrir("editar")}>Gerenciar administrador</Button>
      <Dialog open={open} onOpenChange={fechar}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto [&_button:not([role=checkbox])]:min-h-11">
          <DialogHeader>
            <DialogTitle>Gerenciar administrador</DialogTitle>
            <DialogDescription className="break-words">{convite.nome} · {empresaNome}<br />{mascararEmail(convite.email)} · {mudancaPendente ? "E-mail aguardando confirmação" : convite.status === "ativo" ? "Ativo" : convite.status === "pendente" ? "Convite pendente" : convite.status === "falhou" ? "Falhou" : "Criando acesso"}</DialogDescription>
          </DialogHeader>
          <Tabs value={modo} onValueChange={(value) => { if (!emCurso.current && !pendente) { setModo(value as Modo); setMotivo(value === "email" ? mudancaPendente?.reason ?? "" : ""); setConfirmado(false); } }}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
              <TabsTrigger className="min-h-11" value="editar" disabled={pendente}>Dados</TabsTrigger>
              <TabsTrigger className="min-h-11" value="email" disabled={pendente}>E-mail</TabsTrigger>
              <TabsTrigger className="min-h-11" value="acesso" disabled={pendente}>Acesso</TabsTrigger>
            </TabsList>
            <TabsContent value="editar" className="space-y-4 pt-3">
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="ga-nome">Nome completo</Label>
              <Input id="ga-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ga-tel">Telefone</Label>
              <Input id="ga-tel" inputMode="numeric" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ga-cpf">CPF</Label>
              <Input id="ga-cpf" inputMode="numeric" value={cpf} disabled={cpfBloqueado} onChange={(e) => setCpf(e.target.value)} />
              {cpfBloqueado && <p className="text-xs text-muted-foreground">CPF de administrador ativo exige correção por fluxo específico.</p>}</div>
            <div className="space-y-1"><Label htmlFor="ga-motivo">Motivo (opcional)</Label>
              <Textarea id="ga-motivo" value={motivo} aria-invalid={motivoCurto} onChange={(e) => setMotivo(e.target.value)} />
              {motivoCurto && <p className="text-xs text-destructive">Se informar o motivo, use ao menos 2 caracteres.</p>}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pendente} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={!editarValido || pendente} onClick={salvarEdicao}>{editar.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
            </TabsContent>
            <TabsContent value="email" className="space-y-4 pt-3">
              <p className="text-sm text-muted-foreground">O e-mail atual continua válido até o titular confirmar a mudança pelos links recebidos.</p>
          <div className="space-y-3">
            <p className="text-sm">E-mail atual: <span className="break-all font-mono">{convite.email}</span></p>
            {mudancaPendente && (
               <div className="space-y-1 text-sm text-muted-foreground"><p>Aguardando confirmação do titular para <span className="break-all">{mudancaPendente.new_email}</span>.</p><p>Último envio: {mudancaPendente.confirmation_sent_at ? new Date(mudancaPendente.confirmation_sent_at).toLocaleString("pt-BR") : "—"}</p><p>Próximo reenvio: {mudancaPendente.confirmation_next_attempt_at ? new Date(mudancaPendente.confirmation_next_attempt_at).toLocaleString("pt-BR") : "—"}</p><p>Links já emitidos não podem ser cancelados com segurança. Aguarde a expiração ou verifique a confirmação para reconciliar a solicitação.</p>{reenvioAmbiguo && <p>A entrega anterior não foi confirmada. Verifique a caixa de entrada; reenviar pode duplicar a mensagem.</p>}</div>
            )}
            <div className="space-y-1"><Label htmlFor="ga-email">Novo e-mail</Label>
              <Input id="ga-email" type="email" value={novoEmail} disabled={!!mudancaPendente} onChange={(e) => setNovoEmail(e.target.value)} /></div>
            {!mudancaPendente && <div className="space-y-1"><Label htmlFor="ga-email-confirmacao">Confirmar novo e-mail</Label><Input id="ga-email-confirmacao" type="email" value={confirmacaoEmail} onChange={(e) => setConfirmacaoEmail(e.target.value)} /></div>}
            <div className="space-y-1"><Label htmlFor="ga-motivo-email">Motivo (opcional)</Label>
              <Textarea id="ga-motivo-email" value={motivo} disabled={!!mudancaPendente} aria-invalid={motivoCurto} onChange={(e) => setMotivo(e.target.value)} />
              {motivoCurto && <p className="text-xs text-destructive">Se informar o motivo, use ao menos 2 caracteres.</p>}</div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirmado} onCheckedChange={(v) => setConfirmado(v === true)} aria-label="Confirmo a alteração" />
               <span>{reenvioAmbiguo ? "Verifiquei a caixa de entrada e autorizo o reenvio, ciente da possível duplicação." : "Confirmo que o novo endereço pertence a este administrador."}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pendente} onClick={() => setOpen(false)}>Cancelar</Button>
            {mudancaPendente ? <div className="flex flex-wrap gap-2">
               <Button variant="outline" disabled={pendente || !confirmado || reenvioCooldown} onClick={() => salvarEmail("resend")}>Reenviar confirmação</Button>
              <Button disabled={pendente} onClick={() => salvarEmail("reconcile")}>Verificar confirmação</Button>
            </div> : <Button disabled={!emailValido || pendente} onClick={() => salvarEmail()}>{alterarEmail.isPending ? "Enviando…" : "Confirmar alteração"}</Button>}
          </DialogFooter>
            </TabsContent>
            <TabsContent value="acesso" className="space-y-4 pt-3">
              {modo === "acesso" && <AdminAcessoSection convite={convite} mudanca={mudancaPendente} convidar={convidar} operationLock={emCurso} onBusyChange={setAccessBusy} />}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
