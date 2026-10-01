/**
 * Troca de senha obrigatória no primeiro acesso.
 *
 * Exibida quando o perfil está marcado com `senha_provisoria` (acesso criado
 * pelo superadmin via convite ou senha temporária). Bloqueia a navegação até
 * que o próprio usuário defina a senha definitiva. A baixa da marca é feita
 * pela RPC `platform_conclude_provisional_password`, que só altera o registro
 * do próprio usuário autenticado.
 */
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function TrocaSenhaObrigatoria() {
  const { refresh, signOut } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setErro(null);
    if (senha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirma) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        setErro("Não foi possível salvar a nova senha. Tente novamente.");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcError } = await (supabase as any).rpc(
        "platform_conclude_provisional_password",
      );
      if (rpcError) {
        setErro("A senha foi alterada, mas a liberação falhou. Recarregue a página.");
        return;
      }
      toast.success("Senha definida. Bem-vindo!");
      await refresh();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-base">Defina sua senha de acesso</CardTitle>
          </div>
          <CardDescription>
            Seu acesso foi criado com uma senha provisória. Crie uma senha pessoal para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirma-senha">Repita a nova senha</Label>
            <Input
              id="confirma-senha"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
            />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={signOut} disabled={salvando}>
              Sair
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar e entrar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default TrocaSenhaObrigatoria;
