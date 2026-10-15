import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformInviteRedirectUrl } from "../../../supabase/functions/_shared/platform-invite-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft } from "lucide-react";

export function PasswordRecoveryForm({ initialEmail = "", onBack }: { initialEmail?: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [coolingDown, setCoolingDown] = useState(false);
  const retryAfter = useRef(0);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (cooldownTimer.current !== null) clearTimeout(cooldownTimer.current);
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || confirmed || Date.now() < retryAfter.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const { error: failure } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getPlatformInviteRedirectUrl(),
      });
      if (!mounted.current) return;
      // Não reproduzir mensagens do provedor que possam enumerar contas.
      if (failure?.code === "over_email_send_rate_limit" || failure?.code === "over_request_rate_limit" || failure?.status === 429) {
        setError("O serviço de email atingiu um limite temporário de envios. Aguarde e tente novamente mais tarde.");
        // Pausa local de interface, não previsão de liberação do provedor.
        retryAfter.current = Date.now() + 60_000;
        setCoolingDown(true);
        cooldownTimer.current = setTimeout(() => {
          cooldownTimer.current = null;
          retryAfter.current = 0;
          if (mounted.current) setCoolingDown(false);
        }, 60_000);
      }
      else if (failure) setError("Não foi possível solicitar a recuperação. Aguarde e tente novamente.");
      else setConfirmed(true);
    } catch {
      if (mounted.current) setError("Não foi possível solicitar a recuperação. Aguarde e tente novamente.");
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  return <div className="space-y-4">
    <Button type="button" variant="ghost" onClick={onBack} disabled={loading}>
      <ArrowLeft className="h-4 w-4" /> Voltar ao login
    </Button>
    {confirmed ? <p role="status" className="text-sm text-muted-foreground">
      Se houver uma conta elegível para este email, você receberá um link para recuperar sua senha.
    </p> : <form onSubmit={submit} className="space-y-4" aria-label="Recuperar senha" aria-busy={loading}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2">
        <Label htmlFor="recovery-email">Email</Label>
        <Input id="recovery-email" type="email" autoComplete="email" value={email}
          onChange={(event) => setEmail(event.target.value)} required disabled={loading} className="h-12 sm:h-11" />
      </div>
      <Button type="submit" className="w-full h-12 sm:h-11" disabled={loading || coolingDown}>
        {loading ? "Enviando…" : coolingDown ? "Aguarde para tentar novamente" : "Enviar link de recuperação"}
      </Button>
    </form>}
  </div>;
}
