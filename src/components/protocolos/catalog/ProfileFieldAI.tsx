import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { FichaIaError, gerarFichaCampo } from "@/lib/fichaIaClient";
import { toast } from "sonner";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  readOnly?: boolean;
  // IA
  entidadeTipo?: "produto" | "microrganismo";
  entidadeId?: string;
  campo?: string;
  canGenerateAI?: boolean;
  onVersaoCriada?: (versaoId: string) => void;
}

export function ProfileFieldAI({
  label, value, onChange, rows = 3, readOnly = false,
  entidadeTipo, entidadeId, campo, canGenerateAI = false, onVersaoCriada,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [aiBanner, setAiBanner] = useState<string | null>(null);
  const [erro, setErro] = useState<{ mensagem: string; retry: boolean } | null>(null);
  const [confirmarSubstituicao, setConfirmarSubstituicao] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const emVooRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  const executar = async () => {
    if (!entidadeTipo || !entidadeId || !campo) return;
    if (emVooRef.current) return; // impede chamadas duplicadas
    emVooRef.current = true;
    setLoading(true);
    setErro(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new FichaIaError("Sua sessão expirou. Entre novamente para gerar com IA.", "nao_autenticado", false);
      }
      const res = await gerarFichaCampo({
        entidadeTipo, entidadeId, campo, token, signal: ctrl.signal,
      });
      onChange(res.texto);
      setAiBanner(res.justificativa ?? "Rascunho sugerido por IA — revise antes de salvar.");
      if (res.versaoId) onVersaoCriada?.(res.versaoId);
      toast.success("Rascunho gerado pela IA");
    } catch (e) {
      const err = e instanceof FichaIaError
        ? e
        : new FichaIaError("Não foi possível gerar o texto agora. Tente novamente.", "servico", true);
      if (err.causa !== "cancelado") {
        setErro({ mensagem: err.message, retry: err.podeTentarNovamente });
        toast.error(err.message);
      }
    } finally {
      emVooRef.current = false;
      abortRef.current = null;
      setLoading(false);
    }
  };

  const solicitar = () => {
    if (loading) return;
    if (value && value.trim().length > 0) {
      setConfirmarSubstituicao(true);
      return;
    }
    void executar();
  };

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {canGenerateAI && !readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={loading}
            aria-busy={loading}
            onClick={solicitar}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            {loading ? "Gerando…" : "Gerar com IA"}
          </Button>
        )}
      </div>
      <Textarea className="w-full" value={value} onChange={(e) => onChange(e.target.value)} rows={rows} readOnly={readOnly} />
      {erro && (
        <div role="alert" className="text-[11px] text-destructive border border-destructive/30 rounded px-2 py-1 flex items-center justify-between gap-2">
          <span>{erro.mensagem}</span>
          {erro.retry && (
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void executar()}>
              Tentar novamente
            </Button>
          )}
        </div>
      )}
      {aiBanner && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 italic">
          ⚠ {aiBanner} Rascunho não salvo automaticamente. Não substitui prescrição agronômica.
        </p>
      )}

      <AlertDialog open={confirmarSubstituicao} onOpenChange={setConfirmarSubstituicao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir o texto atual?</AlertDialogTitle>
            <AlertDialogDescription>
              Este campo já tem conteúdo. O rascunho gerado pela IA vai substituir o texto na tela; nada é salvo antes de você confirmar o salvamento da ficha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmarSubstituicao(false); void executar(); }}>
              Gerar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
