import { formatDateDisplay } from "@/lib/date-utils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Beaker,
  Droplets,
  Calendar,
  Repeat,
  AlertTriangle,
  MapPin,
  Sprout,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Target,
  ClipboardList,
  ShieldAlert,
  FlaskConical,
  Activity,
  Lightbulb,
  Layers,
  History,
  ExternalLink,
  Check,
  X,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseConduta } from "@/lib/condutaSerializer";
import { RoteiroVisita } from "@/components/visita/roteiro/RoteiroVisita";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORIA_LABELS,
  ESTRATEGIA_LABELS,
  MODO_LABELS,
  OBJ_LABELS,
  PRESSAO_VARIANT,
  PRIORIDADE_CLASSES,
  PRIORIDADE_LABELS,
  RETORNO_LABELS,
  STATUS_LABELS,
} from "./recomendacaoLabels";
import { RecomendacaoChat } from "@/components/shared/RecomendacaoChat";

interface Props {
  registro: any;
  recomendacoes: any[];
  defaultOpen?: boolean;
}

export function TalhaoRecomendacaoCard({ registro, recomendacoes, defaultOpen = false }: Props) {
  const [openDiag, setOpenDiag] = useState(defaultOpen);
  const [openConduta, setOpenConduta] = useState(defaultOpen);
  const [openRoteiro, setOpenRoteiro] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refusalReason, setRefusalReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const status = registro?.status as string | undefined;
  const talhao = registro?.talhoes?.nome || "Talhão";
  const fazenda = registro?.fazendas?.nome || "Fazenda";
  const cultura = registro?.culturas?.nome;
  const fase = registro?.fase_fenologica;
  const area = registro?.area_hectares;
  const data = registro?.data_vistoria
    ? formatDateDisplay(registro.data_vistoria)
    : null;

  const { conduta, clean } = parseConduta(registro?.observacoes_tecnicas);

  const handleDecision = async (decision: "aceitar_os" | "aceitar_direto" | "recusar") => {
    setIsSubmitting(true);
    try {
      const statusAnterior = registro?.status;
      const newStatus = (decision === "aceitar_os" ? "convertido_os" : "finalizado") as any;
      const confirmacao =
        decision === "aceitar_os"
          ? "solicitou_os"
          : decision === "aceitar_direto"
            ? "aceita_sem_os"
            : "recusada";

      // 1) Se for "Aprovar e gerar OS", criar as OS PRIMEIRO. Se falhar, o registro
      //    continua em "aprovado" e o produtor pode tentar de novo.
      if (decision === "aceitar_os") {
        const prioridade =
          registro?.nivel_pressao === "critica" || registro?.nivel_pressao === "alta"
            ? "alta"
            : "media";
        const areaCalc =
          Number(registro?.area_hectares) ||
          Number(registro?.talhoes?.area_hectares) ||
          0;

        for (const rec of recomendacoes) {
          const dose = Number(rec.dose_recomendada_valor) || 0;
          const volumeTotal = dose * areaCalc;
          const produtoId = rec.produto_biologico_sugerido_id || rec.produto_id || null;

          const { error: osError } = await supabase.from("ordens_servico_onfarm").insert({
            registro_consultor_id: registro.id,
            cliente_id: registro.cliente_id,
            fazenda_id: registro.fazenda_id,
            talhao_id: registro.talhao_id,
            produto_id: produtoId,
            dose_ml_ha: dose,
            area_hectares: areaCalc,
            volume_total_ml: volumeTotal,
            modo_aplicacao: rec.modo_aplicacao || null,
            status: "aberta" as any,
            prioridade: prioridade as any,
            data_recomendada: new Date().toISOString().split("T")[0],
          } as any);

          if (osError) throw osError;
        }
      }

      // 2) Atualizar status do registro
      const { data: updatedReg, error: regError } = await supabase
        .from("registros_consultor")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", registro.id)
        .select("id")
        .maybeSingle();
      if (regError) throw regError;
      if (!updatedReg) {
        throw new Error(
          "Não foi possível atualizar o status da recomendação. Verifique suas permissões e tente novamente.",
        );
      }

      // 3) Histórico de status (igual ao caminho do gestor)
      await supabase.from("registros_consultor_status_log").insert({
        registro_consultor_id: registro.id,
        status_anterior: statusAnterior,
        status_novo: newStatus,
        changed_by: user?.id || null,
        motivo:
          decision === "recusar"
            ? `Recusada pelo produtor: ${refusalReason.trim() || "sem motivo informado"}`
            : decision === "aceitar_os"
              ? "Aprovada pelo produtor — OS gerada"
              : "Aceita pelo produtor sem aplicação",
      } as any);

      // 4) Espelhar no portal_solicitacoes, quando houver vínculo
      if (registro.solicitacao_id) {
        await supabase
          .from("portal_solicitacoes")
          .update({
            status: newStatus === "finalizado" ? "concluida" : "aguardando_os",
            confirmacao_produtor: confirmacao,
            updated_at: new Date().toISOString(),
          })
          .eq("id", registro.solicitacao_id);
      }

      toast({
        title:
          decision === "aceitar_os"
            ? "Aprovado — Ordem de Serviço gerada"
            : decision === "aceitar_direto"
              ? "Recomendação aceita"
              : "Recomendação recusada",
        description:
          decision === "aceitar_os"
            ? "A OS entrou na fila de produção. Acompanhe em Ordens de Serviço."
            : decision === "recusar"
              ? "O consultor poderá ajustar a prescrição e reenviar."
              : "Registro atualizado.",
      });

      queryClient.invalidateQueries({ queryKey: ["portal-fila-recs"] });
      queryClient.invalidateQueries({ queryKey: ["portal-fila-aguardando"] });
      queryClient.invalidateQueries({ queryKey: ["portal-recomendacoes"] });
      queryClient.invalidateQueries({ queryKey: ["portal-ordens-servico"] });
    } catch (error: any) {
      console.error("[TalhaoRecomendacaoCard] handleDecision falhou:", error);
      toast({
        title: "Erro ao processar decisão",
        description: error?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasDiagnostico =
    registro?.problema_principal ||
    registro?.problema_secundario ||
    registro?.categoria_problema ||
    registro?.percentual_area_afetada != null ||
    registro?.localizacao_na_area ||
    registro?.condicoes_climaticas_observadas;

  const hasConduta =
    !!conduta &&
    !!(
      conduta.acaoRealizada ||
      conduta.orientacaoCliente ||
      conduta.recomendacaoPreliminar ||
      conduta.observacoesFinais ||
      conduta.necessidadeRetorno !== "avaliar_depois" ||
      conduta.prioridadeOperacional !== "media"
    );

  const observacaoLivre = (clean || "").trim();

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* ===== Header: Talhão em destaque ===== */}
        <div className="p-4 sm:p-5 bg-muted/30 border-b">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{fazenda}</span>
                {data && (
                  <>
                    <span>•</span>
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>Última visita {data}</span>
                  </>
                )}
              </div>
              <div className="flex items-start gap-2">
                <Layers className="h-6 w-6 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-lg sm:text-xl text-foreground leading-tight break-words">
                    {talhao}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[cultura && `${cultura}${fase ? ` • ${fase}` : ""}`, area && `${Number(area).toLocaleString("pt-BR")} ha`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {status && (
                  <Badge
                    variant={
                      status === "convertido_os"
                        ? "default"
                        : status === "aprovado"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-[10px]"
                  >
                    {STATUS_LABELS[status] || status}
                  </Badge>
                )}
                {registro?.nivel_pressao && (
                  <Badge
                    variant={PRESSAO_VARIANT[registro.nivel_pressao] || "outline"}
                    className="text-[10px] capitalize"
                  >
                    Pressão {registro.nivel_pressao}
                  </Badge>
                )}
                {cultura && (
                  <Badge variant="outline" className="text-[10px]">
                    <Sprout className="h-3 w-3 mr-1" />
                    {cultura}
                  </Badge>
                )}
              </div>
            </div>

            <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
              <div className="rounded-md bg-background border px-3 py-2 text-left sm:text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Recomendações
                </div>
                <div className="text-2xl font-bold text-primary leading-tight">
                  {recomendacoes.length}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {recomendacoes.length === 1 ? "produto" : "produtos"}
                </div>
              </div>
              {registro?.id && (
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <Link to={`/portal/registros/${registro.id}`}>
                    <ExternalLink className="h-3 w-3 mr-1.5" />
                    Roteiro completo
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ===== Diagnóstico ===== */}
        {hasDiagnostico && (
          <CollapsibleSection
            open={openDiag}
            onToggle={() => setOpenDiag(!openDiag)}
            icon={<ShieldAlert className="h-4 w-4 text-amber-600" />}
            title="Diagnóstico que originou a recomendação"
          >
            <div className="space-y-2.5 text-sm">
              {registro.problema_principal && (
                <InfoRow label="Problema principal" value={registro.problema_principal} />
              )}
              {registro.problema_secundario && (
                <InfoRow label="Problema secundário" value={registro.problema_secundario} />
              )}
              {registro.categoria_problema && (
                <InfoRow
                  label="Categoria"
                  value={
                    CATEGORIA_LABELS[registro.categoria_problema] || registro.categoria_problema
                  }
                />
              )}
              {registro.percentual_area_afetada != null && (
                <InfoRow label="Área afetada" value={`${registro.percentual_area_afetada}%`} />
              )}
              {registro.localizacao_na_area && (
                <InfoRow label="Localização na área" value={registro.localizacao_na_area} />
              )}
              {registro.condicoes_climaticas_observadas && (
                <InfoRow
                  icon={<CloudSun className="h-3.5 w-3.5" />}
                  label="Clima observado"
                  value={registro.condicoes_climaticas_observadas}
                />
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* ===== Conduta do consultor (parseada) ===== */}
        {(hasConduta || observacaoLivre) && (
          <>
            <Separator />
            <CollapsibleSection
              open={openConduta}
              onToggle={() => setOpenConduta(!openConduta)}
              icon={<Lightbulb className="h-4 w-4 text-primary" />}
              title="Conduta do consultor"
              right={
                conduta?.prioridadeOperacional && conduta.prioridadeOperacional !== "media" ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      PRIORIDADE_CLASSES[conduta.prioridadeOperacional],
                    )}
                  >
                    Prioridade {PRIORIDADE_LABELS[conduta.prioridadeOperacional]}
                  </Badge>
                ) : null
              }
            >
              <div className="space-y-2.5 text-sm">
                {conduta?.acaoRealizada && (
                  <InfoRow label="Ação realizada na visita" value={conduta.acaoRealizada} />
                )}
                {conduta?.orientacaoCliente && (
                  <InfoRow label="Orientação passada ao cliente" value={conduta.orientacaoCliente} />
                )}
                {conduta?.recomendacaoPreliminar && (
                  <InfoRow
                    label="Recomendação preliminar"
                    value={conduta.recomendacaoPreliminar}
                  />
                )}
                {conduta?.necessidadeRetorno && (
                  <InfoRow
                    label="Necessidade de retorno"
                    value={
                      <>
                        {RETORNO_LABELS[conduta.necessidadeRetorno] || conduta.necessidadeRetorno}
                        {conduta.necessidadeRetorno === "sim" && conduta.dataSugeridaRetorno && (
                          <> — {formatDateDisplay(conduta.dataSugeridaRetorno)}</>
                        )}
                      </>
                    }
                  />
                )}
                {conduta?.observacoesFinais && (
                  <InfoRow label="Observações finais" value={conduta.observacoesFinais} />
                )}
                {observacaoLivre && (
                  <InfoRow label="Observações do consultor" value={observacaoLivre} />
                )}
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* ===== Roteiro da visita (inline, lazy mount) ===== */}
        {registro?.id && (
          <>
            <Separator />
            <CollapsibleSection
              open={openRoteiro}
              onToggle={() => setOpenRoteiro(!openRoteiro)}
              icon={<History className="h-4 w-4 text-primary" />}
              title="Roteiro da visita"
            >
              {openRoteiro && (
                <div className="-mx-1">
                  <RoteiroVisita registroId={registro.id} hideHeader readOnly viewer="produtor" />
                </div>
              )}
            </CollapsibleSection>
          </>
        )}

        <Separator />


        {/* ===== Produtos recomendados ===== */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">
              Produtos recomendados ({recomendacoes.length})
            </h4>
          </div>
          <div className="space-y-2.5">
            {recomendacoes.map((rec) => (
              <ProdutoRecomendadoItem key={rec.id} rec={rec} />
            ))}
          </div>
        </div>

        {/* ===== Conversa com consultor ===== */}
        {recomendacoes[0]?.id && (
          <>
            <Separator />
            <div className="p-4 sm:p-5">
              <RecomendacaoChat recomendacaoId={recomendacoes[0].id} />
            </div>
          </>
        )}



        {/* ===== Ações do Produtor (Apenas se pendente de decisão) ===== */}
        {status === "aprovado" && (
          <>
            <Separator />
            <div className="p-4 sm:p-5 bg-primary/5 space-y-4">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground uppercase tracking-tight">
                  Sua decisão sobre esta recomendação
                </h4>
              </div>
              
              <div className="rounded-md border border-primary/20 bg-background p-3 text-xs text-muted-foreground space-y-1.5">
                <p>
                  <span className="font-semibold text-foreground">Aprovar e gerar OS</span> — confirma
                  a aplicação. Uma Ordem de Serviço entra automaticamente na fila de produção e você
                  acompanha em <Link to="/portal/ordens-servico" className="text-primary underline">Ordens de Serviço</Link>.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Aceitar sem aplicar</span> — registra
                  sua concordância técnica, sem gerar OS.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Recusar</span> — devolve ao consultor
                  para ajuste da prescrição.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button 
                  className="w-full flex items-center justify-center gap-2 h-11"
                  disabled={isSubmitting}
                  onClick={() => handleDecision("aceitar_os")}
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Aprovar e gerar OS
                </Button>

                <Button 
                  variant="outline" 
                  className="w-full flex items-center justify-center gap-2 h-11 border-primary/30 text-primary hover:bg-primary/10"
                  disabled={isSubmitting}
                  onClick={() => handleDecision("aceitar_direto")}
                >
                  <Check className="h-4 w-4" />
                  Aceitar sem aplicar
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full flex items-center justify-center gap-2 h-11 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                      Recusar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Recusar recomendação técnica?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Por favor, informe o motivo da recusa para que o consultor possa ajustar a prescrição.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-2">
                      <Textarea 
                        placeholder="Ex: Já realizei esta aplicação / Vou optar por outro produto..." 
                        value={refusalReason}
                        onChange={(e) => setRefusalReason(e.target.value)}
                        className="min-h-[100px]"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction 
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={() => handleDecision("recusar")}
                        disabled={!refusalReason.trim() || isSubmitting}
                      >
                        Confirmar Recusa
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              
              <p className="text-[11px] text-muted-foreground italic text-center">
                Ao solicitar aplicação, uma Ordem de Serviço será gerada automaticamente.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProdutoRecomendadoItem({ rec }: { rec: any }) {
  const [open, setOpen] = useState(false);
  const produto =
    rec.produtos?.nome ||
    rec.microrganismos?.nome ||
    rec.microrganismos?.nome_cientifico ||
    "Produto não especificado";
  const ingrediente =
    rec.produtos?.funcao_completa ||
    rec.microrganismos?.funcao_agronomica ||
    rec.microrganismos?.nome_cientifico;

  const hasDetalhes =
    rec.volume_calda ||
    rec.momento_aplicacao ||
    rec.numero_aplicacoes ||
    rec.intervalo_aplicacoes ||
    rec.volume_total_recomendado ||
    rec.cuidados_operacionais ||
    rec.compatibilidade_observacoes ||
    rec.observacoes_finais;

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <FlaskConical className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm sm:text-base text-foreground break-words leading-tight">
                {produto}
              </p>
              {ingrediente && (
                <p className="text-xs text-muted-foreground mt-0.5 break-words">{ingrediente}</p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {rec.objetivo_recomendacao && (
                  <Badge variant="default" className="text-[10px]">
                    <Target className="h-3 w-3 mr-1" />
                    {OBJ_LABELS[rec.objetivo_recomendacao] || rec.objetivo_recomendacao}
                  </Badge>
                )}
                {rec.estrategia_manejo && (
                  <Badge variant="outline" className="text-[10px]">
                    {ESTRATEGIA_LABELS[rec.estrategia_manejo] || rec.estrategia_manejo}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="sm:text-right shrink-0 rounded-md bg-muted/40 px-3 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
              Dose
            </div>
            <div className="text-base sm:text-lg font-bold text-primary leading-tight">
              {rec.dose_recomendada_valor
                ? `${rec.dose_recomendada_valor} ${rec.dose_recomendada_unidade || ""}`
                : "—"}
            </div>
            {rec.modo_aplicacao && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {MODO_LABELS[rec.modo_aplicacao] || rec.modo_aplicacao}
              </div>
            )}
          </div>
        </div>

        {hasDetalhes && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="mt-3 text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"
          >
            {open ? "Ocultar detalhes" : "Ver detalhes da aplicação"}
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {open && hasDetalhes && (
        <div className="px-3 sm:px-4 pb-4 pt-1 border-t bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <DetailItem
              icon={<Beaker className="h-3.5 w-3.5" />}
              label="Modo de aplicação"
              value={rec.modo_aplicacao ? MODO_LABELS[rec.modo_aplicacao] || rec.modo_aplicacao : null}
            />
            <DetailItem
              icon={<Droplets className="h-3.5 w-3.5" />}
              label="Volume de calda"
              value={rec.volume_calda}
            />
            <DetailItem
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Momento da aplicação"
              value={rec.momento_aplicacao}
            />
            <DetailItem
              icon={<Repeat className="h-3.5 w-3.5" />}
              label="Aplicações"
              value={
                rec.numero_aplicacoes
                  ? `${rec.numero_aplicacoes}${rec.intervalo_aplicacoes ? ` • intervalo ${rec.intervalo_aplicacoes}` : ""}`
                  : rec.intervalo_aplicacoes || null
              }
            />
            <DetailItem
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Volume total recomendado"
              value={rec.volume_total_recomendado}
            />
          </div>
          {(rec.cuidados_operacionais ||
            rec.compatibilidade_observacoes ||
            rec.observacoes_finais) && (
            <div className="mt-3 pt-3 border-t space-y-2.5 text-sm">
              {rec.cuidados_operacionais && (
                <InfoRow
                  icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                  label="Cuidados operacionais"
                  value={rec.cuidados_operacionais}
                />
              )}
              {rec.compatibilidade_observacoes && (
                <InfoRow label="Compatibilidade" value={rec.compatibilidade_observacoes} />
              )}
              {rec.observacoes_finais && (
                <InfoRow label="Observações finais" value={rec.observacoes_finais} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  open,
  onToggle,
  icon,
  title,
  right,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 sm:px-5 py-3 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {right}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-4 sm:px-5 pb-4">{children}</div>}
    </>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mb-0.5">
        {icon} {label}
      </span>
      <span className={cn("text-sm", !value && "text-muted-foreground italic")}>
        {value || "Não informado"}
      </span>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {icon} {label}
      </span>
      <span className="text-sm text-foreground whitespace-pre-wrap break-words">{value}</span>
    </div>
  );
}
