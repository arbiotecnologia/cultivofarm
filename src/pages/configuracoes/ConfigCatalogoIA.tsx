import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDateTimeDisplay } from "@/lib/date-utils";

const CAMPOS_PRODUTO = [
  "resumo_curto", "explicacao_tecnica", "indicacoes_uso", "janela_aplicacao",
  "explicacao_produtor", "explicacao_b2b", "cuidados_aplicacao",
  "compatibilidade", "observacoes_regulatorias",
];
const CAMPOS_MICRO = [
  "resumo_curto", "mecanismo_acao", "beneficios_agronomicos", "explicacao_tecnica",
  "explicacao_produtor", "explicacao_b2b", "indicacoes_uso",
  "cuidados_aplicacao", "compatibilidade", "armazenamento", "observacoes_regulatorias",
];

export default function ConfigCatalogoIA() {
  const { roles } = useAuth();
  const isPlatformSuperadmin = roles.includes("superadmin");

  const [tipos, setTipos] = useState<{ produto: boolean; microrganismo: boolean }>({ produto: true, microrganismo: true });
  const [campos, setCampos] = useState<Set<string>>(new Set(["resumo_curto"]));
  const [iniciando, setIniciando] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [pendentes, setPendentes] = useState(0);

  const carregar = async () => {
    const { data } = await supabase.from("ai_refresh_jobs").select("*").order("iniciado_em", { ascending: false }).limit(10);
    setJobs(data ?? []);
    const { count } = await supabase.from("ficha_tecnica_versoes").select("id", { count: "exact", head: true }).eq("status", "pendente");
    setPendentes(count ?? 0);
  };

  useEffect(() => { if (isPlatformSuperadmin) carregar(); }, [isPlatformSuperadmin]);

  if (!isPlatformSuperadmin) {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito ao Superadmin de Plataforma.</div>;
  }

  const todosCampos = Array.from(new Set([...CAMPOS_PRODUTO, ...CAMPOS_MICRO]));

  const toggleCampo = (c: string) => {
    const novo = new Set(campos);
    if (novo.has(c)) novo.delete(c); else novo.add(c);
    setCampos(novo);
  };

  const iniciarLote = async () => {
    const entidade_tipos = [tipos.produto && "produto", tipos.microrganismo && "microrganismo"].filter(Boolean);
    if (entidade_tipos.length === 0) return toast.error("Selecione ao menos um tipo");
    if (campos.size === 0) return toast.error("Selecione ao menos um campo");
    setIniciando(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-refresh-fichas", {
        body: { action: "start", entidade_tipos, campos: Array.from(campos) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Job iniciado: ${(data as any).total} itens em processamento`);
      carregar();
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar lote");
    } finally {
      setIniciando(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Atualização global das fichas técnicas com IA
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Gera sugestões de conteúdo para os campos selecionados. Cada sugestão entra como versão pendente
          e precisa de aprovação humana antes de substituir o conteúdo atual.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disparar lote</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Tipos de item</Label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={tipos.produto} onCheckedChange={(v) => setTipos({ ...tipos, produto: !!v })} /> Produtos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={tipos.microrganismo} onCheckedChange={(v) => setTipos({ ...tipos, microrganismo: !!v })} /> Microrganismos
              </label>
            </div>
          </div>
          <div>
            <Label className="text-xs">Campos a regenerar</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
              {todosCampos.map((c) => (
                <label key={c} className="flex items-center gap-2 text-xs">
                  <Checkbox checked={campos.has(c)} onCheckedChange={() => toggleCampo(c)} />
                  <span className="font-mono">{c}</span>
                </label>
              ))}
            </div>
          </div>
          <Button onClick={iniciarLote} disabled={iniciando}>
            {iniciando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Iniciar geração em lote
          </Button>
          <p className="text-[10px] text-muted-foreground italic">
            ⚠ A IA pode levar vários minutos para processar lotes grandes. As sugestões aparecem como versões
            pendentes em cada ficha técnica e não substituem prescrição agronômica.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Jobs recentes</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{pendentes} versões pendentes de aprovação</Badge>
            <Button size="sm" variant="ghost" onClick={carregar}><RefreshCw className="h-3 w-3" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum job ainda.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="border rounded p-2 text-xs flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={j.status === "concluido" ? "secondary" : j.status === "processando" ? "default" : "outline"}>{j.status}</Badge>
                    <span className="font-mono text-[10px]">{j.id.slice(0, 8)}</span>
                    <span>{formatDateTimeDisplay(j.iniciado_em)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {j.itens_processados}/{j.total_itens} processados · {j.itens_com_sugestao} sugestões · {j.itens_falhos} falhas
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
