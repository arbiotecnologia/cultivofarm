import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  lerFalhaPrimeiroAcesso,
  mensagemFalhaPrimeiroAcesso,
  senhaForte,
  REGRA_SENHA,
} from "@/lib/saas/firstAccess";
import { completeRecoveryPassword, type RecoveryPasswordMode } from "@/lib/saas/recoveryFlow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function limparCredenciaisDaUrl() {
  window.history.replaceState({}, document.title, "/reset-password");
}

function temFragmentoSensivelDeRecovery(hash: string) {
  return hash.includes("access_token=") || hash.includes("refresh_token=") || hash.includes("type=recovery");
}

export default function ResetPassword() {
  const [recovery, setRecovery] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryPasswordMode | null>(null);
  const [checkingMode, setCheckingMode] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let mounted = true;
    const fragmentoSensivel = temFragmentoSensivelDeRecovery(window.location.hash);
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && mounted) {
        setRecovery(true);
        limparCredenciaisDaUrl();
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session && fragmentoSensivel) {
        setRecovery(true);
      }
      // getSession aguarda a inicialização do supabase-js e o consumo seguro do
      // implicit flow. Depois disso, nenhum fragmento sensível permanece visível,
      // inclusive quando o link estiver expirado ou já tiver sido usado.
      if (fragmentoSensivel) {
        limparCredenciaisDaUrl();
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!recovery) return;
    let mounted = true;
    setCheckingMode(true);
    setRecoveryMode(null);
    setErro("");

    void supabase.functions.invoke("platform-complete-first-access", {
      body: { diagnostico: true },
    }).then(async ({ data, error }) => {
      if (!mounted) return;
      if (error || typeof data?.pendente !== "boolean") {
        const detalhe = error ? await lerFalhaPrimeiroAcesso(error) : null;
        // Falha fechada: sem diagnóstico server-side conclusivo, nenhuma senha muda.
        setErro(mensagemFalhaPrimeiroAcesso(
          detalhe ?? { error: "Não foi possível validar este acesso. Tente abrir o link novamente." },
        ));
        setCheckingMode(false);
        return;
      }
      setRecoveryMode(data.pendente ? "first_access" : "common");
      setCheckingMode(false);
    });

    return () => { mounted = false; };
  }, [recovery]);

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    setErro("");
    if (!senhaForte(senha)) return setErro(REGRA_SENHA);
    if (senha !== confirmacao) return setErro("As senhas não coincidem.");
    if (!recoveryMode) return setErro("Não foi possível validar este acesso. Tente abrir o link novamente.");
    setLoading(true);
    const result = await completeRecoveryPassword(recoveryMode, senha, {
      completeFirstAccess: async (password) => {
        const { error } = await supabase.functions.invoke("platform-complete-first-access", {
          body: { nova_senha: password },
        });
        return { error };
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error };
      },
      signOut: () => supabase.auth.signOut(),
    });
    setSenha(""); setConfirmacao(""); setLoading(false);
    if (!result.ok) {
      if (recoveryMode === "first_access") {
        const detalhe = await lerFalhaPrimeiroAcesso(result.error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (result.error as any)?.context?.status ?? null;
        return setErro(mensagemFalhaPrimeiroAcesso(detalhe, status));
      }
      return setErro("O link expirou, já foi utilizado ou não é válido.");
    }
    setDone(true);
  };

  if (done) return <Navigate to="/auth" replace />;
  return <main className="min-h-screen grid place-items-center bg-background p-4">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Definir nova senha</CardTitle><CardDescription>{recoveryMode === "first_access" ? "Defina sua senha pessoal para concluir o primeiro acesso." : "Use o link de recuperação recebido para continuar."}</CardDescription></CardHeader>
      <CardContent>
        {!recovery ? <Alert><AlertDescription>Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.</AlertDescription></Alert> :
          <form className="space-y-4" onSubmit={salvar}>
            {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
            <div className="space-y-2"><Label htmlFor="recovery-password">Nova senha</Label><Input id="recovery-password" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="recovery-confirm">Confirmar senha</Label><Input id="recovery-confirm" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required /></div>
            <Button className="w-full" type="submit" disabled={loading || checkingMode || !recoveryMode}>{checkingMode ? "Validando acesso…" : loading ? "Salvando…" : recoveryMode === "first_access" ? "Definir senha e continuar" : "Salvar nova senha"}</Button>
          </form>}
      </CardContent>
    </Card>
  </main>;
}