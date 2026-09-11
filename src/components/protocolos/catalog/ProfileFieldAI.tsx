import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
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

  const gerar = async () => {
    if (!entidadeTipo || !entidadeId || !campo) return;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para gerar com IA.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-generate-ficha-campo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entidade_tipo: entidadeTipo, entidade_id: entidadeId, campo, origem: "ia_manual" }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        throw new Error(data?.error || `Erro ao gerar com IA (HTTP ${response.status})`);
      }
      const texto = (data as any)?.texto as string;
      if (!texto) throw new Error("IA não retornou texto");
      onChange(texto);
      setAiBanner((data as any)?.justificativa ?? "Texto sugerido por IA — revise antes de salvar.");
      if ((data as any)?.versao_id) onVersaoCriada?.((data as any).versao_id);
      toast.success("Sugestão gerada pela IA");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar com IA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {canGenerateAI && !readOnly && (
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading} onClick={gerar}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            {loading ? "Gerando…" : "Gerar com IA"}
          </Button>
        )}
      </div>
      <Textarea className="w-full" value={value} onChange={(e) => onChange(e.target.value)} rows={rows} readOnly={readOnly} />
      {aiBanner && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 italic">
          ⚠ {aiBanner} Não substitui prescrição agronômica.
        </p>
      )}
    </div>
  );
}
