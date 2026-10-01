/**
 * Troca de senha obrigatória no primeiro acesso.
 *
 * Exibida quando o perfil está marcado com `senha_provisoria` (acesso criado
 * pelo superadmin via convite ou senha temporária). Bloqueia a navegação até
 * que o próprio usuário defina a senha definitiva.
 *
 * A definição da senha passa exclusivamente pela Edge Function
 * `platform-complete-first-access`, autenticada pelo JWT do próprio usuário:
 * o servidor confirma o estado de primeiro acesso, valida a complexidade,
 * atualiza a senha pela Admin API e só então limpa a marca, em operação
 * transacional. O cliente não pode limpar a marca nem chamando RPC diretamente.
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

/** Mesma política validada no servidor: 8–128 caracteres, letra e dígito. */
export function senhaForte(s: string): boolean {
  return s.length >= 8 && s.length <= 128 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

export function TrocaSenhaObrigatoria() {
  const { refresh, signOut } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setErro(null);
    if (!senhaForte(senha)) {
      setErro("A senha precisa ter de 8 a 128 caracteres, com letras e números.");
      return;
    }
    if (senha !== confirma) {
      setErro("As duas senhas não são iguais.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.functions.invoke("platform-complete-first-access", {
        body: { nova_senha: senha },
      });
      if (error) {
        // Resposta sanitizada do servidor: { error, etapa, codigo } — sem segredos.
        const detalhe = await lerFalhaPrimeiroAcesso(error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (error as any)?.context?.status ?? null;
        setErro(mensagemFalhaPrimeiroAcesso(detalhe, status));
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
              placeholder="Mínimo de 8 caracteres, com letras e números"
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
