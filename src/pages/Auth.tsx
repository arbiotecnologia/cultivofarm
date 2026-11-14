import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PasswordRecoveryForm } from "@/components/auth/PasswordRecoveryForm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import logoCultivoFarm from "@/assets/logo-cultivofarm.png.asset.json";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { traduzirErroAuth } from "@/lib/auth-errors";

// Inicia o download da marca local já no carregamento do módulo, em paralelo à
// leitura de configuracoes_sistema (antes era serial: config → imagem).
if (typeof window !== "undefined" && typeof Image !== "undefined") {
  const preload = new Image();
  preload.decoding = "async";
  preload.src = logoCultivoFarm.url;
}

/**
 * Marca exibida imediatamente: local enquanto a config está pendente/falhou;
 * logo configurado assim que disponível; URL customizada que falhar volta à
 * local (uma vez por URL, sem loop).
 */
export function resolveLoginLogo(customUrl: string | null | undefined, failedUrl: string | null) {
  return customUrl && customUrl !== failedUrl ? customUrl : logoCultivoFarm.url;
}

export default function Auth() {
  const [searchParams, setSearchParams] = useSearchParams();
  const recovery = searchParams.get("recovery") === "1";
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const { config, defaults } = useSystemConfig();
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  const nomeEmpresa = config?.nome_empresa || defaults.nome_empresa;
  const logoUrl = resolveLoginLogo(config?.logo_url, failedLogoUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const friendly = traduzirErroAuth(error);
        setErrorMsg(friendly);
        toast.error(friendly);
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nome },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        const friendly = traduzirErroAuth(error);
        setErrorMsg(friendly);
        toast.error(friendly);
      } else {
        toast.success("Conta criada! Verifique seu email para confirmar.");
        setIsLogin(true);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-6">
            <img
                src={logoUrl}
                onError={() => {
                  // Só a URL customizada cai para a local; falha da local não reentra.
                  if (logoUrl !== logoCultivoFarm.url) setFailedLogoUrl(logoUrl);
                }}
                alt={nomeEmpresa}
                width={1111}
                height={285}
                decoding="async"
                fetchPriority="high"
                className="h-36 sm:h-44 w-auto max-w-full object-contain"
              />
          </div>
          <CardDescription>
            {recovery ? "Definir ou recuperar senha" : isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recovery ? <PasswordRecoveryForm initialEmail={email} onBack={() => {
            setSearchParams((params) => { params.delete("recovery"); return params; }, { replace: true });
          }} /> : <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            {!isLogin && (
              <div className="space-y-1.5 sm:space-y-1">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  required={!isLogin}
                  className="h-12 sm:h-11"
                />
              </div>
            )}
            <div className="space-y-1.5 sm:space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="h-12 sm:h-11"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-1">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-12 sm:h-11 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-12 sm:h-11 mt-2" disabled={loading}>
              {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <Button type="button" variant="link" className="w-full mt-2" disabled={loading}
            onClick={() => {
              setErrorMsg("");
              setSearchParams((params) => { params.set("recovery", "1"); return params; }, { replace: true });
            }}>
            Primeiro acesso ou esqueci minha senha
          </Button>
          </>}
          {/* Registro público removido para segurança do sistema */}
        </CardContent>
      </Card>
    </div>
  );
}
