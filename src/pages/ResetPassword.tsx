import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { senhaForte, REGRA_SENHA } from "@/lib/saas/firstAccess";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function limparCredenciaisDaUrl() {
  window.history.replaceState({}, document.title, "/reset-password");
}

export default function ResetPassword() {
  const [recovery, setRecovery] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && mounted) {
        setRecovery(true);
        limparCredenciaisDaUrl();
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session && window.location.hash.includes("type=recovery")) {
        setRecovery(true);
        limparCredenciaisDaUrl();
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    setErro("");
    if (!senhaForte(senha)) return setErro(REGRA_SENHA);
    if (senha !== confirmacao) return setErro("As senhas não coincidem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSenha(""); setConfirmacao(""); setLoading(false);
    if (error) return setErro("O link expirou, já foi utilizado ou não é válido.");
    await supabase.auth.signOut();
    setDone(true);
  };

  if (done) return <Navigate to="/auth" replace />;
  return <main className="min-h-screen grid place-items-center bg-background p-4">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Definir nova senha</CardTitle><CardDescription>Use o link de recuperação recebido para continuar.</CardDescription></CardHeader>
      <CardContent>
        {!recovery ? <Alert><AlertDescription>Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.</AlertDescription></Alert> :
          <form className="space-y-4" onSubmit={salvar}>
            {erro && <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>}
            <div className="space-y-2"><Label htmlFor="recovery-password">Nova senha</Label><Input id="recovery-password" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="recovery-confirm">Confirmar senha</Label><Input id="recovery-confirm" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required /></div>
            <Button className="w-full" type="submit" disabled={loading}>{loading ? "Salvando…" : "Salvar nova senha"}</Button>
          </form>}
      </CardContent>
    </Card>
  </main>;
}