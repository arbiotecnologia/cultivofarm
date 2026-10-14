/**
 * Fase F2 — Seção de cadastro regulatório e fiscal auditável de microrganismos.
 *
 * Esta seção NÃO infere nada. Ela apenas:
 *  - exibe fatos já registrados no dossiê versionado;
 *  - exibe pendências acionáveis vindas do motor único do servidor;
 *  - registra decisões humanas (confirmação de checklist, aprovação de
 *    NCM, revisões e publicação) via RPCs auditadas.
 *
 * Nenhum NCM, CEST, CFOP, CST, origem, GTIN ou unidade é sugerido pelo
 * cliente. Ausência de dado é sempre "não informado", nunca um palpite.
 */
import { useMemo, useState } from "react";
import {
  useMicroorganismRegulatoryOverview,
  useRegulatoryDossierDetail,
  useRegulatoryActions,
  CHECKLIST_LABELS,
  REGULATORY_CATEGORY_OPTIONS,
  MAPA_STATUS_OPTIONS,
  type ChecklistKey,
  type ChecklistState,
  type RegulatoryOverviewRow,
  type DossierStatus,
} from "@/hooks/useMicroorganismRegulatory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldOff, FileWarning } from "lucide-react";

const NOT_INFORMED = "não informado";

const DOSSIER_STATUS_LABEL: Record<DossierStatus, string> = {
  NONE: "Sem dossiê",
  DRAFT: "Rascunho",
  PENDING_REVIEW: "Em revisão",
  VALIDATED: "Validado",
  BLOCKED: "Bloqueado",
};

function statusVariant(status: DossierStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "VALIDATED") return "default";
  if (status === "BLOCKED") return "destructive";
  if (status === "PENDING_REVIEW") return "secondary";
  return "outline";
}

function text(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : NOT_INFORMED;
}

/**
 * Tradução dos códigos de erro do servidor (Fase F2 — correção pós-auditoria).
 * O servidor sempre falha fechado; aqui apenas explicamos ao operador o que
 * precisa ser feito. Nenhuma regra é reimplementada no cliente.
 */
const SERVER_ERROR_MESSAGES: Record<string, string> = {
  permission_denied: "Sem permissão para esta ação.",
  microorganism_required: "Selecione um microrganismo antes desta ação.",
  // Fonte oficial de NCM
  REGULATORY_NCM_SOURCE_REQUIRED:
    "Candidato de NCM exige fonte oficial: informe uma fonte cadastrada ativa ou uma URL oficial (gov.br), com data de consulta e justificativa de no mínimo 20 caracteres.",
  REGULATORY_NCM_SOURCE_NOT_OFFICIAL:
    "A URL informada não é de fonte oficial. Use a TIPI/Receita Federal, CONFAZ ou outra fonte oficial cadastrada.",
  REGULATORY_NCM_CONSULTED_AT_REQUIRED:
    "Informe a data em que a fonte oficial foi consultada.",
  REGULATORY_NCM_OFFICIAL_SOURCE_REQUIRED:
    "Para aprovar o NCM é obrigatória fonte oficial cadastrada, a descrição oficial do código e a versão/data da tabela.",
  REGULATORY_NCM_CANDIDATE_OTHER_DOSSIER:
    "O candidato de NCM aprovado precisa pertencer a este mesmo dossiê.",
  // GTIN
  REGULATORY_GTIN_CHECK_DIGIT_INVALID:
    "GTIN inválido: o dígito verificador GS1 não confere. Confira o código impresso na embalagem.",
  REGULATORY_GTIN_MUTUALLY_EXCLUSIVE:
    "Escolha uma opção: informar o GTIN ou declarar 'sem GTIN' com justificativa.",
  REGULATORY_GTIN_ABSENT_REASON_REQUIRED:
    "Declarar 'sem GTIN' exige justificativa registrada em auditoria.",
  // Storage escopado
  REGULATORY_STORAGE_PATH_INVALID:
    "Caminho do arquivo fora do padrão. Use dossiers/<dossiê>/<documento>/<arquivo>.",
  REGULATORY_STORAGE_PATH_OUT_OF_SCOPE:
    "O arquivo pertence a outro dossiê. Envie o documento dentro da pasta deste dossiê.",
  REGULATORY_STORAGE_OBJECT_MISSING:
    "O arquivo não foi encontrado no repositório privado. Faça o upload antes de registrar o documento.",
  REGULATORY_STORAGE_IMMUTABLE:
    "Documento de dossiê validado ou publicado não pode ser alterado nem excluído.",
  // Segregação de funções
  REGULATORY_SEGREGATION_OF_DUTIES:
    "Segregação de funções: a mesma pessoa não pode aprovar mais de uma camada do mesmo dossiê. Acione outro responsável.",
  REGULATORY_APPROVALS_INCOMPLETE:
    "Publicação exige as três camadas aprovadas (técnica, regulatória e fiscal) por identidades distintas.",
  REGULATORY_OVERRIDE_FORBIDDEN:
    "Somente administrador pode conceder override emergencial de segregação.",
  REGULATORY_OVERRIDE_JUSTIFICATION_WEAK:
    "Override emergencial exige justificativa detalhada (mínimo de 40 caracteres); o ato fica registrado em auditoria.",
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return SERVER_ERROR_MESSAGES[err.message] ?? err.message;
  }
  return "Falha inesperada.";
}


export function RegulatorioMicrorganismosSecao() {
  const overview = useMicroorganismRegulatoryOverview();
  const [selected, setSelected] = useState<RegulatoryOverviewRow | null>(null);

  const rows = overview.data ?? [];
  const resumo = useMemo(() => {
    const total = rows.length;
    const validados = rows.filter((r) => r.dossier_status === "VALIDATED").length;
    const bloqueados = rows.filter((r) => r.dossier_status === "BLOCKED").length;
    const pendentes = rows.filter(
      (r) => r.dossier_status !== "VALIDATED" && r.dossier_status !== "BLOCKED",
    ).length;
    return { total, validados, bloqueados, pendentes };
  }, [rows]);

  if (overview.isLoading) {
    return (
      <Card data-testid="regulatorio-micro-loading">
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando dossiês regulatórios…
        </CardContent>
      </Card>
    );
  }

  if (overview.isError) {
    const denied = overview.error instanceof Error && overview.error.message === "permission_denied";
    return (
      <Alert variant="destructive" data-testid="regulatorio-micro-error">
        <ShieldOff className="h-4 w-4" aria-hidden />
        <AlertTitle>
          {denied ? "Sem permissão para ler dossiês regulatórios" : "Falha ao carregar dossiês"}
        </AlertTitle>
        <AlertDescription>
          {denied
            ? "Solicite acesso ao administrador."
            : "Nenhum estado regulatório é presumido enquanto a leitura falhar."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card data-testid="regulatorio-micro-secao">
      <CardHeader>
        <CardTitle className="text-base">
          Cadastro regulatório e fiscal de microrganismos
        </CardTitle>
        <CardDescription>
          Dossiê versionado com evidência documental, checklist obrigatório de 12 itens
          e tripla aprovação (técnica, regulatória e fiscal). Nada é presumido:
          o que não foi confirmado aparece como pendência acionável.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Microrganismos ativos</div>
            <div className="font-medium" data-testid="reg-total">{resumo.total}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Dossiês validados</div>
            <div className="font-medium" data-testid="reg-validados">{resumo.validados}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Em preparação/revisão</div>
            <div className="font-medium" data-testid="reg-pendentes">{resumo.pendentes}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Bloqueados</div>
            <div className="font-medium" data-testid="reg-bloqueados">{resumo.bloqueados}</div>
          </div>
        </div>

        <Alert data-testid="regulatorio-regras">
          <AlertTitle>Regras obrigatórias deste cadastro</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <div>
              <strong>Fonte oficial:</strong> todo candidato de NCM exige fonte cadastrada
              ativa ou URL oficial (gov.br), data de consulta e justificativa. Para aprovar,
              também são exigidas a descrição oficial do código e a versão/data da tabela.
            </div>
            <div>
              <strong>Segregação de funções:</strong> a mesma pessoa não aprova mais de uma
              camada do mesmo dossiê. Publicar exige as três camadas aprovadas por identidades
              distintas — ou override emergencial de administrador, justificado e auditado.
            </div>
            <div>
              <strong>Evidências:</strong> arquivos ficam em repositório privado no caminho
              dossiers/&lt;dossiê&gt;/&lt;documento&gt;/&lt;arquivo&gt;. Arquivo de outro dossiê
              é recusado e documento de dossiê validado ou publicado não pode ser alterado
              nem excluído.
            </div>
          </AlertDescription>
        </Alert>

        <Separator />



        <ul className="divide-y" data-testid="regulatorio-micro-lista">
          {rows.length === 0 && (
            <li className="py-6 text-sm text-muted-foreground">
              Nenhum microrganismo ativo encontrado.
            </li>
          )}
          {rows.map((row) => (
            <li
              key={row.microorganism_id}
              className="py-3 flex flex-col md:flex-row md:items-center gap-3"
              data-testid={`regulatorio-row-${row.microorganism_id}`}
            >
              <div className="md:flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{row.nome}</span>
                  {row.codigo && (
                    <span className="text-xs text-muted-foreground">{row.codigo}</span>
                  )}
                  <Badge variant={statusVariant(row.dossier_status)}>
                    {DOSSIER_STATUS_LABEL[row.dossier_status]}
                  </Badge>
                  {row.quarantined && (
                    <Badge variant="destructive">Quarentena</Badge>
                  )}
                  {row.fiscally_ready && <Badge variant="secondary">Apto fiscal</Badge>}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={row.progress_pct} className="h-2 max-w-xs" />
                  <span className="text-xs text-muted-foreground">
                    {row.checklist_confirmed}/{row.checklist_total} itens · {row.progress_pct}%
                  </span>
                </div>
                {row.pendencies.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <FileWarning className="h-3 w-3" aria-hidden />
                    {row.pendencies.length} pendência(s): {row.pendencies[0].message}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(row)}
                aria-label={`Abrir dossiê regulatório de ${row.nome}`}
              >
                Abrir dossiê
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>

      <DossierSheet
        row={selected}
        open={Boolean(selected)}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </Card>
  );
}

interface DossierSheetProps {
  row: RegulatoryOverviewRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DossierSheet({ row, open, onOpenChange }: DossierSheetProps) {
  const microId = row?.microorganism_id ?? null;
  const detail = useRegulatoryDossierDetail(microId, { enabled: open });


  const dossier = detail.data?.dossier ?? null;
  const checklist = detail.data?.checklist ?? [];
  const presentations = detail.data?.presentations ?? [];
  const candidates = detail.data?.ncm_candidates ?? [];
  const documents = detail.data?.documents ?? [];
  const snapshots = detail.data?.snapshots ?? [];


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="regulatorio-dossie-sheet">
        <SheetHeader>
          <SheetTitle>{row?.nome ?? "Dossiê regulatório"}</SheetTitle>
          <SheetDescription>
            {dossier
              ? `Versão ${dossier.version} · ${DOSSIER_STATUS_LABEL[dossier.status]}`
              : "Nenhum dossiê existente para este microrganismo."}
          </SheetDescription>
        </SheetHeader>
        <Alert className="mt-4">
          <AlertTitle>Modo consulta</AlertTitle>
          <AlertDescription>Dossiês regulatórios são catálogo global; alterações não estão disponíveis para empresas.</AlertDescription>
        </Alert>

        {detail.isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando dossiê…
          </div>
        )}

        {!detail.isLoading && !dossier && (
          <div className="py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum dossiê registrado. Modo consulta: o cadastro regulatório global
              será feito pela gestão da plataforma.
            </p>
          </div>
        )}

        {dossier && (
          <Tabs defaultValue="fatos" className="mt-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="fatos">Fatos</TabsTrigger>
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="apresentacoes">Apresentações</TabsTrigger>
              <TabsTrigger value="ncm">NCM</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="revisao">Revisão</TabsTrigger>
              <TabsTrigger value="pendencias">Pendências</TabsTrigger>
            </TabsList>

            {/* FATOS ---------------------------------------------------- */}
            <TabsContent value="fatos" className="space-y-3 pt-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2" data-testid="regulatorio-fatos-consulta">
                {([
                  ["Categoria regulatória", dossier.regulatory_category],
                  ["Código da cepa", dossier.strain_code],
                  ["Nome da cepa", dossier.strain_name],
                  ["Formulação", dossier.formulation],
                  ["Garantia de rótulo", dossier.label_guarantee],
                  ["Situação MAPA", dossier.mapa_status],
                  ["Registro MAPA", dossier.mapa_registration_number],
                  ["Titular MAPA", dossier.mapa_holder],
                  ["Validade MAPA", dossier.mapa_valid_until],
                  ["Motivo de não aplicabilidade MAPA", dossier.mapa_not_applicable_reason],
                ] as const).map(([k, v]) => (
                  <div key={k} className="min-w-0 break-words">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd>{text(v as string | null | undefined)}</dd>
                  </div>
                ))}
              </dl>
            </TabsContent>

            {/* CHECKLIST ------------------------------------------------ */}
            <TabsContent value="checklist" className="space-y-3 pt-4">
              {checklist.map((item) => (
                <div key={item.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {CHECKLIST_LABELS[item.item_key] ?? item.item_key}
                    </span>
                    <Badge
                      variant={
                        item.state === "CONFIRMED" ? "default"
                        : item.state === "NOT_APPLICABLE" ? "secondary"
                        : "outline"
                      }
                    >
                      {item.state === "CONFIRMED" ? "Confirmado"
                        : item.state === "NOT_APPLICABLE" ? "Não aplicável"
                        : "Pendente"}
                    </Badge>
                  </div>
                  {item.justification && (
                    <p className="text-xs text-muted-foreground">
                      Justificativa: {item.justification}
                    </p>
                  )}
                </div>
              ))}
            </TabsContent>

            {/* APRESENTAÇÕES -------------------------------------------- */}
            <TabsContent value="apresentacoes" className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground">
                Volumes importados do catálogo entram sempre como <strong>não confirmados</strong>.
                Unidade comercial, tributável, fator de conversão e GTIN exigem confirmação humana.
              </p>
              {presentations.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma apresentação registrada.</p>
              )}
              {presentations.map((p) => (
                <div key={p.id} className="border rounded-md p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.label}</span>
                    <div className="flex gap-1">
                      <Badge variant={p.units_confirmed ? "default" : "outline"}>
                        {p.units_confirmed ? "Unidades confirmadas" : "Unidades não confirmadas"}
                      </Badge>
                      <Badge variant={p.gtin_confirmed ? "default" : "outline"}>
                        {p.gtin_confirmed
                          ? (p.gtin_absent ? "Sem GTIN (declarado)" : "GTIN confirmado")
                          : "GTIN não confirmado"}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    uCom: {text(p.commercial_unit)} · uTrib: {text(p.taxable_unit)} · fator:{" "}
                    {p.conversion_factor ?? NOT_INFORMED} · GTIN: {text(p.gtin)}
                  </div>
                  <div className="text-xs text-muted-foreground">Origem: {p.origin_note}</div>
                </div>
              ))}
            </TabsContent>

            {/* NCM ------------------------------------------------------ */}
            <TabsContent value="ncm" className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground">
                Todo candidato exige justificativa e fonte oficial consultada. A aprovação
                é ato fiscal registrado.
              </p>
              {candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum candidato registrado.</p>
              )}
              {candidates.map((c) => (
                <div key={c.id} className="border rounded-md p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      NCM {c.ncm}{c.cest ? ` · CEST ${c.cest}` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={confidenceBadgeVariant(c.confidence)}>
                        {confidenceLabel(c.confidence)}
                      </Badge>
                      <Badge
                        variant={
                          c.status === "APPROVED" ? "default"
                          : c.status === "REJECTED" ? "destructive"
                          : "outline"
                        }
                      >
                        {c.status === "APPROVED" ? "Aprovado"
                          : c.status === "REJECTED" ? "Rejeitado" : "Proposto"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.justification}</p>
                  <p className="text-xs text-muted-foreground">
                    Fonte: {text(c.source_url)} · consulta: {text(c.consulted_at)}
                  </p>
                  {c.confidence === "CONDITIONAL" && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Enquadramento condicional à alegação de uso: não pode ser aprovado
                      antes da definição da finalidade regulatória.
                    </p>
                  )}
            </TabsContent>

            {/* DOCUMENTOS ----------------------------------------------- */}
            <TabsContent value="documentos" className="space-y-3 pt-4">
              {documents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum documento registrado. Rótulo e laudo são obrigatórios para publicar.
                </p>
              )}
              {documents.map((d) => (
                <div key={d.id} className="border rounded-md p-3 text-sm">
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Tipo: {d.doc_type} · emissor: {text(d.issuer)} · validade: {text(d.valid_until)}
                  </div>
                  <div className="text-xs text-muted-foreground break-all">
                    SHA-256: {d.content_sha256}
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* REVISÃO -------------------------------------------------- */}
            <TabsContent value="revisao" className="space-y-3 pt-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <ReviewBadge label="Técnica" value={dossier.technical_review_status} />
                <ReviewBadge label="Regulatória" value={dossier.regulatory_review_status} />
                <ReviewBadge label="Fiscal" value={dossier.fiscal_review_status} />
              </div>

              {snapshots.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="font-medium text-foreground">Publicações imutáveis</div>
                  {snapshots.map((s) => (
                    <div key={`${s.version}-${s.published_at}`} className="break-all">
                      v{s.version} · {s.published_at} · {s.snapshot_sha256}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* PENDÊNCIAS ----------------------------------------------- */}
            <TabsContent value="pendencias" className="space-y-2 pt-4">
              {(row?.pendencies ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma pendência aberta.</p>
              )}
              {(row?.pendencies ?? []).map((p) => (
                <div key={`${p.code}-${p.field}`} className="border rounded-md p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{p.layer === "TECHNICAL" ? "Técnica" : "Regulatória"}</Badge>
                    <code className="text-xs">{p.code}</code>
                  </div>
                  <p className="mt-1">{p.message}</p>
                  {p.items && p.items.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{p.items.join(", ")}</p>
                  )}
                </div>
              ))}
              {(row?.not_applicable ?? []).length > 0 && (
                <div className="pt-2">
                  <div className="text-sm font-medium">Itens marcados como não aplicáveis</div>
                  {(row?.not_applicable ?? []).map((n) => (
                    <p key={n.item_key} className="text-xs text-muted-foreground">
                      {CHECKLIST_LABELS[n.item_key as ChecklistKey] ?? n.item_key}: {text(n.justification)}
                    </p>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <SheetFooter className="pt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ReviewBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Badge
        variant={value === "APPROVED" ? "default" : value === "REJECTED" ? "destructive" : "outline"}
      >
        {value === "APPROVED" ? "Aprovada" : value === "REJECTED" ? "Rejeitada" : "Pendente"}
      </Badge>
    </div>
  );
}

interface DraftFacts {
  regulatory_category: string | null;
  strain_code: string | null;
  strain_name: string | null;
  formulation: string | null;
  label_guarantee: string | null;
  mapa_status: string | null;
  mapa_registration_number: string | null;
  mapa_holder: string | null;
  mapa_valid_until: string | null;
  mapa_not_applicable_reason: string | null;
}

function confidenceLabel(value: string | null | undefined): string {
  switch (value) {
    case "HIGH": return "Confiança alta";
    case "MEDIUM": return "Confiança média";
    case "CONDITIONAL": return "Condicional";
    case "LOW": return "Confiança baixa";
    default: return "Confiança não informada";
  }
}

function confidenceBadgeVariant(
  value: string | null | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  switch (value) {
    case "HIGH": return "default";
    case "MEDIUM": return "secondary";
    case "CONDITIONAL": return "destructive";
    default: return "outline";
  }
}

export default RegulatorioMicrorganismosSecao;
