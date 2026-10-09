import { formatDateDisplay } from "@/lib/date-utils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FichaProdutorDrawer } from "@/components/catalogo/FichaProdutorDrawer";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseConduta } from "@/lib/condutaSerializer";
import { RoteiroVisita } from "@/components/visita/roteiro/RoteiroVisita";
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



        {status === "aprovado" && <div className="p-4 sm:p-5 border-t">
          <p role="status" className="text-sm text-muted-foreground">Decisão do produtor indisponível. Recomendação disponível somente para consulta.</p>
        </div>}
      </CardContent>
    </Card>
  );
}

function ProdutoRecomendadoItem({ rec }: { rec: any }) {
  const [open, setOpen] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const fichaItem: { id: string; tipo: "produto" | "microrganismo" } | null =
    rec.produto_biologico_sugerido_id
      ? { id: rec.produto_biologico_sugerido_id, tipo: "produto" }
      : rec.microrganismo_id
      ? { id: rec.microrganismo_id, tipo: "microrganismo" }
      : null;
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

        <div className="mt-3 flex flex-wrap items-center gap-4">
          {hasDetalhes && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"
            >
              {open ? "Ocultar detalhes" : "Ver detalhes da aplicação"}
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
          {fichaItem && (
            <button
              type="button"
              onClick={() => setFichaOpen(true)}
              className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"
            >
              Entender este bioinsumo
            </button>
          )}
        </div>
      </div>

      {fichaItem && (
        <FichaProdutorDrawer
          open={fichaOpen}
          onOpenChange={setFichaOpen}
          itemId={fichaItem.id}
          tipo={fichaItem.tipo}
          origem="recomendacao"
        />
      )}


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
