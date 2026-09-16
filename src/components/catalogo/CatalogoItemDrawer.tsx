/**
 * Ficha unificada do Catálogo Cultivo Farm — Fase 26D (somente leitura).
 *
 * Abre um produto ou microrganismo em uma visualização única com abas,
 * reaproveitando exclusivamente os dados já carregados por
 * `useCatalogoUnificado`. Nenhuma query nova, nenhuma edição, nenhum
 * fluxo crítico (aprovação técnica, precificação, pedido B2B) é tocado.
 */
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TechnicalProfileStatusBadge } from "@/components/protocolos/TechnicalProfileStatusBadge";
import type { CatalogoUnificadoRow } from "@/hooks/useCatalogoUnificado";
import {
  PLACEHOLDER_VAZIO,
  REFERENCIA_DOSE_LITRO,
  formatarMoeda,
} from "@/lib/catalogo/formatUnidades";

/** Escopo visual da ficha. Amplia `CatalogoScope` com o portal do produtor. */
export type CatalogoFichaScope = "admin" | "interno" | "b2b" | "produtor";

export const CATALOGO_FICHA_VAZIO_VOLUMES =
  "Volumes comerciais disponíveis na gestão de volumes do catálogo.";

export const CATALOGO_FICHA_VOLUMES_AUXILIAR =
  "Esta ficha não executa nova consulta; para editar volumes, use a gestão de volumes do catálogo.";


/** Escopos que podem ver conteúdo interno (texto técnico, fontes, auditoria). */
export function fichaPermiteInterno(scope: CatalogoFichaScope): boolean {
  return scope === "admin" || scope === "interno";
}

/** Texto B2B nunca aparece no portal do produtor. */
export function fichaPermiteTextoB2B(scope: CatalogoFichaScope): boolean {
  return scope !== "produtor";
}

/** Texto para produtor não é exibido no escopo B2B (parceiro). */
export function fichaPermiteTextoProdutor(scope: CatalogoFichaScope): boolean {
  return scope !== "b2b";
}

/** Alertas simples derivados apenas de dados já presentes na linha. */
export function catalogoFichaAlertas(row: CatalogoUnificadoRow): string[] {
  const alertas: string[] = [];
  if (row.tipo === "produto" && (row.composicao_count ?? 0) === 0) {
    alertas.push("Produto sem composição");
  }
  if (row.ficha_status === "rascunho") alertas.push("Ficha em rascunho");
  if (row.ficha_status === "em_revisao") alertas.push("Ficha em revisão");
  if (row.ficha_status === "aprovado" && row.fontes_count === 0) {
    alertas.push("Ficha aprovada sem fonte técnica");
  }
  return alertas;
}

export interface CatalogoFichaPublicacao {
  b2bVisivel: boolean;
  b2bMotivo: string;
  produtorVisivel: boolean;
  produtorMotivo: string;
}

export const CATALOGO_FICHA_PUBLICACAO_OK = "Visível conforme regras atuais";

/**
 * Diagnóstico visual de publicação — não altera a regra real de publicação,
 * não grava nada e não expõe ação de publicar/despublicar.
 */
export function catalogoFichaPublicacao(row: CatalogoUnificadoRow): CatalogoFichaPublicacao {
  const aprovado = row.ficha_status === "aprovado";
  const b2bVisivel = row.ativo && row.b2b_enabled && aprovado;
  const produtorVisivel = row.ativo && aprovado;

  const motivo = (b2bDesabilitado: boolean): string => {
    if (!row.ativo) return "Item inativo";
    if (b2bDesabilitado) return "B2B desabilitado";
    if (!aprovado) return "Ficha não aprovada";
    return CATALOGO_FICHA_PUBLICACAO_OK;
  };

  return {
    b2bVisivel,
    b2bMotivo: b2bVisivel ? CATALOGO_FICHA_PUBLICACAO_OK : motivo(!row.b2b_enabled),
    produtorVisivel,
    produtorMotivo: produtorVisivel ? CATALOGO_FICHA_PUBLICACAO_OK : motivo(false),
  };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm break-words">{value ?? PLACEHOLDER_VAZIO}</div>
    </div>
  );
}

function Texto({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap text-foreground/90">
        {value?.trim() ? value : PLACEHOLDER_VAZIO}
      </p>
    </div>
  );
}

interface Props {
  item: CatalogoUnificadoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope?: CatalogoFichaScope;
}

export function CatalogoItemDrawer({ item, open, onOpenChange, scope = "interno" }: Props) {
  const interno = fichaPermiteInterno(scope);
  const raw = (item?.raw ?? {}) as Record<string, unknown>;

  const dose = num(raw.dose_ml_ha);
  const valorDose = num(raw.valor_dose_brl);
  const valorLitro = num(raw.valor_litro_brl);
  const valorHa = num(raw.valor_ha_brl);
  const unidade = typeof raw.unidade === "string" ? raw.unidade : null;
  const composicao = Array.isArray(raw.composicao) ? (raw.composicao as unknown[]) : null;
  const volumes = Array.isArray(raw.volumes) ? (raw.volumes as Record<string, unknown>[]) : null;

  const alertas = item ? catalogoFichaAlertas(item) : [];
  const publicacao = catalogoFichaPublicacao(
    item ?? ({ ativo: false, b2b_enabled: false, ficha_status: null } as CatalogoUnificadoRow),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {item && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[9px] uppercase">{item.tipo}</Badge>
                {item.codigo && (
                  <span className="font-mono text-[10px] text-muted-foreground">{item.codigo}</span>
                )}
                {!item.ativo && <Badge variant="destructive" className="text-[9px]">Inativo</Badge>}
                {item.b2b_enabled && <Badge className="text-[9px] bg-blue-600">B2B</Badge>}
              </div>
              <SheetTitle className="text-lg">{item.nome}</SheetTitle>
              {item.subtitulo && (
                <SheetDescription className="italic">{item.subtitulo}</SheetDescription>
              )}
            </SheetHeader>

            <Tabs defaultValue="geral" className="mt-4">
              <TabsList className="flex w-full flex-wrap h-auto">
                <TabsTrigger value="geral">Geral</TabsTrigger>
                <TabsTrigger value="comercial">Comercial</TabsTrigger>
                <TabsTrigger value="tecnica">Técnica</TabsTrigger>
                <TabsTrigger value="volumes">Volumes e Preços</TabsTrigger>
                <TabsTrigger value="publicacao">Publicação</TabsTrigger>
                {item.tipo === "produto" && composicao && (
                  <TabsTrigger value="composicao">Composição</TabsTrigger>
                )}
                <TabsTrigger value="status">Status</TabsTrigger>
              </TabsList>

              <TabsContent value="geral" className="mt-4 grid grid-cols-2 gap-4">
                <Campo label="Nome" value={item.nome} />
                <Campo label="Tipo" value={item.tipo === "produto" ? "Produto" : "Microrganismo"} />
                <Campo label="Categoria / função" value={item.funcao} />
                <Campo label="Código / SKU" value={item.codigo} />
                <Campo label="Situação" value={item.ativo ? "Ativo" : "Inativo"} />
                <Campo label="B2B habilitado" value={item.b2b_enabled ? "Sim" : "Não"} />
              </TabsContent>

              <TabsContent value="comercial" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Campo label="Dose (mL/ha)" value={dose === null ? null : dose} />
                  <Campo label="Valor por dose" value={valorDose === null ? null : formatarMoeda(valorDose)} />
                  <Campo label="Valor por litro" value={valorLitro === null ? null : formatarMoeda(valorLitro)} />
                  <Campo label="Valor por hectare" value={valorHa === null ? null : formatarMoeda(valorHa)} />
                  <Campo label="Unidade principal" value={unidade} />
                </div>
                <p className="text-[11px] text-muted-foreground italic">{REFERENCIA_DOSE_LITRO}</p>
              </TabsContent>

              <TabsContent value="tecnica" className="mt-4 space-y-4">
                <Texto label="Resumo" value={item.ficha_resumo} />
                {interno && <Texto label="Explicação técnica" value={item.explicacao_tecnica} />}
                {fichaPermiteTextoProdutor(scope) && (
                  <Texto label="Explicação para o produtor" value={item.explicacao_produtor} />
                )}
                {fichaPermiteTextoB2B(scope) && (
                  <Texto label="Explicação B2B" value={item.explicacao_b2b} />
                )}
                {item.tipo === "microrganismo" && (
                  <>
                    <Texto label="Mecanismo de ação" value={item.mecanismo_acao} />
                    <Texto label="Benefícios agronômicos" value={item.beneficios_agronomicos} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="volumes" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Campo label="Dose (mL/ha)" value={dose === null ? null : dose} />
                  <Campo label="Valor por dose" value={valorDose === null ? null : formatarMoeda(valorDose)} />
                  <Campo label="Valor por litro" value={valorLitro === null ? null : formatarMoeda(valorLitro)} />
                  <Campo label="Valor por hectare" value={valorHa === null ? null : formatarMoeda(valorHa)} />
                  <Campo label="Unidade principal" value={unidade} />
                </div>
                <p className="text-[11px] text-muted-foreground italic">{REFERENCIA_DOSE_LITRO}</p>
                <Separator />
                {volumes && volumes.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {volumes.map((v, i) => {
                      const rotulo =
                        v.rotulo ?? v.nome ??
                        (num(v.volume_litros) !== null ? `${v.volume_litros} L` : null) ??
                        (num(v.volume_ml) !== null ? `${v.volume_ml} mL` : null);
                      const precoVolume = num(v.preco_brl);
                      const precoLitro = num(v.preco_litro_brl);
                      const precoDose = num(v.valor_dose_100ml_brl);
                      return (
                        <li key={i} className="rounded border px-2 py-1">
                          <span className="font-medium">{String(rotulo ?? PLACEHOLDER_VAZIO)}</span>
                          {(precoVolume !== null || precoLitro !== null || precoDose !== null) && (
                            <span className="text-muted-foreground">
                              {" — "}
                              {[
                                precoVolume !== null ? formatarMoeda(precoVolume) : null,
                                precoLitro !== null ? `${formatarMoeda(precoLitro)}/L` : null,
                                precoDose !== null ? `${formatarMoeda(precoDose)} / 100 mL` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{CATALOGO_FICHA_VAZIO_VOLUMES}</p>
                )}
                <p className="text-[11px] text-muted-foreground italic">
                  {CATALOGO_FICHA_VOLUMES_AUXILIAR}
                </p>
              </TabsContent>

              <TabsContent value="publicacao" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Campo label="Situação" value={item.ativo ? "Ativo" : "Inativo"} />
                  <Campo label="B2B habilitado" value={item.b2b_enabled ? "Sim" : "Não"} />
                  <Campo
                    label="Status da ficha"
                    value={<TechnicalProfileStatusBadge status={item.ficha_status} />}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Campo
                    label="Potencialmente visível ao parceiro B2B"
                    value={`${publicacao.b2bVisivel ? "Sim" : "Não"} — ${publicacao.b2bMotivo}`}
                  />
                  <Campo
                    label="Potencialmente visível ao produtor"
                    value={`${publicacao.produtorVisivel ? "Sim" : "Não"} — ${publicacao.produtorMotivo}`}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground italic">
                  Diagnóstico visual somente leitura — não altera a publicação real do item.
                </p>
              </TabsContent>



              {item.tipo === "produto" && composicao && (
                <TabsContent value="composicao" className="mt-4 space-y-2">
                  {composicao.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem composição registrada.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {composicao.map((c, i) => (
                        <li key={i} className="rounded border px-2 py-1">
                          {typeof c === "string"
                            ? c
                            : String((c as Record<string, unknown>)?.nome ?? PLACEHOLDER_VAZIO)}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              )}

              <TabsContent value="status" className="mt-4 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Status da ficha
                  </span>
                  <TechnicalProfileStatusBadge status={item.ficha_status} />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  {interno && <Campo label="Fontes técnicas" value={item.fontes_count} />}
                  <Campo label="Alvos / culturas" value={item.alvos_count} />
                  {item.tipo === "produto" && (
                    <Campo label="Itens de composição" value={item.composicao_count ?? 0} />
                  )}
                </div>
                {interno && alertas.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {alertas.map((a) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="text-[10px] border-amber-300 text-amber-800 bg-amber-50"
                      >
                        {a}
                      </Badge>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
