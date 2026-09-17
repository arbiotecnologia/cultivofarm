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
  const actions = useRegulatoryActions(microId);

  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState("");

  const dossier = detail.data?.dossier ?? null;
  const checklist = detail.data?.checklist ?? [];
  const presentations = detail.data?.presentations ?? [];
  const candidates = detail.data?.ncm_candidates ?? [];
  const documents = detail.data?.documents ?? [];
  const snapshots = detail.data?.snapshots ?? [];

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast({ title: label, description: "Registrado com trilha de auditoria." });
    } catch (err) {
      toast({
        title: "Ação recusada pelo servidor",
        description: errorMessage(err),
        variant: "destructive",
      });
    }
  }

  async function setChecklistState(
    itemKey: ChecklistKey,
    state: ChecklistState,
  ) {
    if (!dossier) return;
    const justification = (justifications[itemKey] ?? "").trim();
    if (state === "NOT_APPLICABLE" && justification.length === 0) {
      toast({
        title: "Justificativa obrigatória",
        description: "Marcar como não aplicável exige justificativa registrada.",
        variant: "destructive",
      });
      return;
    }
    await run("Checklist atualizado", () =>
      actions.setChecklist.mutateAsync({
        dossierId: dossier.id,
        itemKey,
        state,
        justification: justification.length > 0 ? justification : null,
      }),
    );
  }

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

        {detail.isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando dossiê…
          </div>
        )}

        {!detail.isLoading && !dossier && (
          <div className="py-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Nenhum dossiê registrado. Criar rascunho não preenche nenhum dado
              regulatório — apenas abre a estrutura e o checklist obrigatório.
            </p>
            <Button
              onClick={() => run("Rascunho criado", () => actions.ensureDraft.mutateAsync())}
              disabled={actions.ensureDraft.isPending}
            >
              Criar rascunho
            </Button>
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
              <DraftFactsForm
                dossierId={dossier.id}
                editable={dossier.status === "DRAFT" || dossier.status === "PENDING_REVIEW"}
                initial={{
                  regulatory_category: dossier.regulatory_category,
                  strain_code: dossier.strain_code,
                  strain_name: dossier.strain_name,
                  formulation: dossier.formulation,
                  label_guarantee: dossier.label_guarantee,
                  mapa_status: dossier.mapa_status,
                  mapa_registration_number: dossier.mapa_registration_number,
                  mapa_holder: dossier.mapa_holder,
                  mapa_valid_until: dossier.mapa_valid_until,
                  mapa_not_applicable_reason: dossier.mapa_not_applicable_reason,
                }}
                onSave={(patch) =>
                  run("Fatos regulatórios atualizados", () =>
                    actions.updateDraft.mutateAsync({ dossierId: dossier.id, patch }),
                  )
                }
                saving={actions.updateDraft.isPending}
              />
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
                  <Textarea
                    rows={2}
                    placeholder="Justificativa (obrigatória para 'não aplicável')"
                    aria-label={`Justificativa para ${CHECKLIST_LABELS[item.item_key] ?? item.item_key}`}
                    value={justifications[item.item_key] ?? ""}
                    onChange={(e) =>
                      setJustifications((p) => ({ ...p, [item.item_key]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setChecklistState(item.item_key, "CONFIRMED")}
                      disabled={actions.setChecklist.isPending}
                    >
                      Confirmar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setChecklistState(item.item_key, "NOT_APPLICABLE")}
                      disabled={actions.setChecklist.isPending}
                    >
                      Não aplicável
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setChecklistState(item.item_key, "PENDING")}
                      disabled={actions.setChecklist.isPending}
                    >
                      Reabrir
                    </Button>
                  </div>
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
                  {c.status === "PROPOSED" && (

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          run("Candidato aprovado", () =>
                            actions.decideNcmCandidate.mutateAsync({
                              candidateId: c.id,
                              approve: true,
                              reason: reviewNote.trim() || "Aprovado após análise fiscal do dossiê.",
                            }),
                          )
                        }
                        disabled={
                          actions.decideNcmCandidate.isPending ||
                          c.confidence === "CONDITIONAL"
                        }

                      >
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run("Candidato rejeitado", () =>
                            actions.decideNcmCandidate.mutateAsync({
                              candidateId: c.id,
                              approve: false,
                              reason: reviewNote.trim() || "Rejeitado após análise fiscal do dossiê.",
                            }),
                          )
                        }
                        disabled={actions.decideNcmCandidate.isPending}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <NcmCandidateForm
                onSubmit={(input) =>
                  run("Candidato registrado", () =>
                    actions.addNcmCandidate.mutateAsync({ dossierId: dossier.id, ...input }),
                  )
                }
                pending={actions.addNcmCandidate.isPending}
              />
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
              <Textarea
                rows={3}
                placeholder="Justificativa da decisão (obrigatória)"
                aria-label="Justificativa da decisão de revisão"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {(["TECHNICAL", "REGULATORY", "FISCAL"] as const).map((layer) => (
                  <div key={layer} className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reviewNote.trim().length === 0 || actions.reviewDecide.isPending}
                      onClick={() =>
                        run("Revisão registrada", () =>
                          actions.reviewDecide.mutateAsync({
                            dossierId: dossier.id,
                            layer,
                            decision: "APPROVED",
                            justification: reviewNote.trim(),
                          }),
                        )
                      }
                    >
                      Aprovar {layer === "TECHNICAL" ? "técnica" : layer === "REGULATORY" ? "regulatória" : "fiscal"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={reviewNote.trim().length === 0 || actions.reviewDecide.isPending}
                      onClick={() =>
                        run("Revisão registrada", () =>
                          actions.reviewDecide.mutateAsync({
                            dossierId: dossier.id,
                            layer,
                            decision: "REJECTED",
                            justification: reviewNote.trim(),
                          }),
                        )
                      }
                    >
                      Rejeitar
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={dossier.status !== "DRAFT" || actions.submit.isPending}
                  onClick={() => run("Dossiê submetido", () => actions.submit.mutateAsync(dossier.id))}
                >
                  Submeter para revisão
                </Button>
                <Button
                  size="sm"
                  disabled={actions.publish.isPending}
                  onClick={() => run("Dossiê publicado", () => actions.publish.mutateAsync(dossier.id))}
                >
                  Publicar (validar)
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reviewNote.trim().length === 0 || actions.block.isPending}
                  onClick={() =>
                    run("Dossiê bloqueado", () =>
                      actions.block.mutateAsync({ dossierId: dossier.id, reason: reviewNote.trim() }),
                    )
                  }
                >
                  Bloquear
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reviewNote.trim().length === 0 || actions.newVersion.isPending}
                  onClick={() =>
                    run("Nova versão aberta", () => actions.newVersion.mutateAsync(reviewNote.trim()))
                  }
                >
                  Nova versão
                </Button>
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

function DraftFactsForm({
  initial, editable, saving, onSave,
}: {
  dossierId: string;
  initial: DraftFacts;
  editable: boolean;
  saving: boolean;
  onSave: (patch: Partial<DraftFacts>) => void;
}) {
  const [form, setForm] = useState<DraftFacts>(initial);
  const set = <K extends keyof DraftFacts>(k: K, v: DraftFacts[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const mapaNotApplicable = form.mapa_status === "NOT_APPLICABLE";

  return (
    <div className="space-y-3">
      {!editable && (
        <Alert>
          <AlertTitle>Dossiê não editável</AlertTitle>
          <AlertDescription>
            Somente rascunhos ou dossiês em revisão aceitam alteração de fatos.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-categoria">Finalidade regulatória</Label>
          <Select
            value={form.regulatory_category ?? ""}
            onValueChange={(v) => set("regulatory_category", v)}
            disabled={!editable}
          >
            <SelectTrigger id="reg-categoria"><SelectValue placeholder={NOT_INFORMED} /></SelectTrigger>
            <SelectContent>
              {REGULATORY_CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-mapa-status">Situação MAPA</Label>
          <Select
            value={form.mapa_status ?? ""}
            onValueChange={(v) => set("mapa_status", v)}
            disabled={!editable}
          >
            <SelectTrigger id="reg-mapa-status"><SelectValue placeholder={NOT_INFORMED} /></SelectTrigger>
            <SelectContent>
              {MAPA_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-cepa-codigo">Código da cepa</Label>
          <Input
            id="reg-cepa-codigo" disabled={!editable}
            value={form.strain_code ?? ""}
            onChange={(e) => set("strain_code", e.target.value)}
          />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-cepa-nome">Nome da cepa</Label>
          <Input
            id="reg-cepa-nome" disabled={!editable}
            value={form.strain_name ?? ""}
            onChange={(e) => set("strain_name", e.target.value)}
          />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-formulacao">Formulação</Label>
          <Input
            id="reg-formulacao" disabled={!editable}
            value={form.formulation ?? ""}
            onChange={(e) => set("formulation", e.target.value)}
          />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-registro">Nº de registro MAPA</Label>
          <Input
            id="reg-registro" disabled={!editable || mapaNotApplicable}
            value={form.mapa_registration_number ?? ""}
            onChange={(e) => set("mapa_registration_number", e.target.value)}
          />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-titular">Titular / fabricante</Label>
          <Input
            id="reg-titular" disabled={!editable}
            value={form.mapa_holder ?? ""}
            onChange={(e) => set("mapa_holder", e.target.value)}
          />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-validade">Validade do registro</Label>
          <Input
            id="reg-validade" type="date" disabled={!editable || mapaNotApplicable}
            value={form.mapa_valid_until ?? ""}
            onChange={(e) => set("mapa_valid_until", e.target.value || null)}
          />
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-1.5">
        <Label htmlFor="reg-garantia">Composição e garantia de rótulo</Label>
        <Textarea
          id="reg-garantia" rows={3} disabled={!editable}
          value={form.label_guarantee ?? ""}
          onChange={(e) => set("label_guarantee", e.target.value)}
        />
      </div>

      {mapaNotApplicable && (
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="reg-mapa-na">Justificativa de não aplicabilidade do registro</Label>
          <Textarea
            id="reg-mapa-na" rows={2} disabled={!editable}
            value={form.mapa_not_applicable_reason ?? ""}
            onChange={(e) => set("mapa_not_applicable_reason", e.target.value)}
          />
        </div>
      )}

      <Button
        disabled={!editable || saving}
        onClick={() => onSave(form)}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />}
        Salvar fatos
      </Button>
    </div>
  );
}

const CONFIDENCE_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CONDITIONAL"] as const;

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

function NcmCandidateForm({
  onSubmit, pending,
}: {
  onSubmit: (input: {
    ncm: string; justification: string; cest: string | null; confidence: string;
    sourceKey: string; sourceUrl: string | null; consultedAt: string | null;
  }) => void;
  pending: boolean;
}) {
  const [ncm, setNcm] = useState("");
  const [cest, setCest] = useState("");
  const [justification, setJustification] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [consultedAt, setConsultedAt] = useState("");
  const [confidence, setConfidence] = useState<string>("LOW");

  const valid =
    /^\d{8}$/.test(ncm.replace(/\D/g, "")) &&
    justification.trim().length > 0 &&
    sourceKey.trim().length > 0 &&
    CONFIDENCE_OPTIONS.includes(confidence as (typeof CONFIDENCE_OPTIONS)[number]);


  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="text-sm font-medium">Registrar candidato de NCM</div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="cand-ncm">NCM (8 dígitos)</Label>
          <Input id="cand-ncm" value={ncm} onChange={(e) => setNcm(e.target.value)} />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="cand-cest">CEST (opcional)</Label>
          <Input id="cand-cest" value={cest} onChange={(e) => setCest(e.target.value)} />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="cand-fonte">Chave da fonte oficial</Label>
          <Input id="cand-fonte" value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="cand-url">URL da fonte</Label>
          <Input id="cand-url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="cand-data">Data da consulta</Label>
          <Input id="cand-data" type="date" value={consultedAt} onChange={(e) => setConsultedAt(e.target.value)} />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <Label htmlFor="cand-conf">Confiança da classificação</Label>
          <select
            id="cand-conf"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          >
            {CONFIDENCE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{confidenceLabel(opt)}</option>
            ))}
          </select>
          {confidence === "CONDITIONAL" && (
            <p className="text-xs text-muted-foreground">
              Candidato condicional não pode ser aprovado até a definição da alegação de uso.
            </p>
          )}
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-1.5">
        <Label htmlFor="cand-just">Justificativa técnica (TIPI / notas explicativas)</Label>
        <Textarea id="cand-just" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} />
      </div>
      <Button
        size="sm"
        disabled={!valid || pending}
        onClick={() =>
          onSubmit({
            ncm: ncm.replace(/\D/g, ""),
            cest: cest.trim() || null,
            justification: justification.trim(),
            sourceKey: sourceKey.trim(),
            sourceUrl: sourceUrl.trim() || null,
            consultedAt: consultedAt || null,
            confidence,

          })
        }
      >
        Registrar candidato
      </Button>
    </div>
  );
}

export default RegulatorioMicrorganismosSecao;
