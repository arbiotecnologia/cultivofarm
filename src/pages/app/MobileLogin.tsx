import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { traduzirErroAuth } from "@/lib/auth-errors";

import { LogoDisplay } from "@/components/LogoDisplay";

export default function MobileLogin() {
  const { user } = useAuth();
  const { config, defaults } = useSystemConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "recovery">("login");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const nomeEmpresa = config?.nome_empresa || defaults.nome_empresa;
  const logoUrl = config?.logo_url || null;

  if (user) return <Navigate to="/app" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const friendly = traduzirErroAuth(error);
      setErrorMsg(friendly);
      toast.error(friendly);
    }
    setLoading(false);
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      const friendly = traduzirErroAuth(error);
      setErrorMsg(friendly);
      toast.error(friendly);
    } else {
      toast.success("Email de recuperação enviado!");
      setMode("login");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <LogoDisplay size="xl" className="mb-4 shadow-lg" />
        <h1 className="text-2xl font-bold text-foreground">{nomeEmpresa}</h1>
        <p className="text-sm text-muted-foreground mt-1">App de Campo</p>
      </div>

      {mode === "login" ? (
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-5">
          {errorMsg && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="h-12 text-base"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="h-12 text-base pr-12"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>

          <button
            type="button"
            onClick={() => setMode("recovery")}
            className="block w-full text-center text-sm text-primary font-medium"
          >
            Esqueceu a senha?
          </button>
        </form>
      ) : (
        <form onSubmit={handleRecovery} className="w-full max-w-sm space-y-5">
          <button
            type="button"
            onClick={() => setMode("login")}
            className="flex items-center gap-1 text-sm text-muted-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>

          <p className="text-sm text-muted-foreground">
            Informe seu email para receber o link de recuperação de senha.
          </p>

          {errorMsg && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="recovery-email" className="text-sm font-medium">Email</Label>
            <Input
              id="recovery-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="h-12 text-base"
            />
          </div>

          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </Button>
        </form>
      )}
    </div>
  );
}
