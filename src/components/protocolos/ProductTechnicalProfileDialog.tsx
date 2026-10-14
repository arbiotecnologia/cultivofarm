import { TENANT_CAN_EDIT_GLOBAL_CATALOG } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProductProfile, useUpsertProductProfile } from "@/hooks/useProductProfile";
import { TechnicalProfileStatusBadge } from "./TechnicalProfileStatusBadge";
import { ProductFormulaBenefits } from "./ProductFormulaBenefits";
import { useLogCatalogAccess } from "@/hooks/useLogCatalogAccess";
import { gerarPreviaBeneficioCombinado } from "@/lib/catalogo/beneficiosCombinados";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { supabase } from "@/integrations/supabase/client";
import { Info, Loader2, Sparkles } from "lucide-react";
import { ProfileStatusBanner } from "./catalog/ProfileStatusBanner";
import { TargetsManager } from "./catalog/TargetsManager";
import { CropsManager } from "./catalog/CropsManager";
import { SourcesManager } from "./catalog/SourcesManager";
import { ReturnToReviewButton } from "./catalog/ReturnToReviewButton";
import { ApprovalChecklistDialog, ChecklistItem } from "./catalog/ApprovalChecklistDialog";
import { ProfileField } from "./catalog/ProfileField";
import { ProfileFieldAI } from "./catalog/ProfileFieldAI";
import { ProfileLoadErrorState } from "./catalog/ProfileLoadErrorState";
import {
  buildProductFormDefaults,
  emptyProductForm,
  mapProductProfileToForm,
  type ProductFormState,
} from "@/lib/catalogo/fichaFormDefaults";
import { VersoesHistoricoTab } from "./catalog/VersoesHistoricoTab";
import { useEffectiveCatalogSources } from "@/hooks/useEffectiveCatalogSources";
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

interface Produto {
  id: string;
  codigo: string | null;
  nome: string;
  tipo: string;
  descricao?: string | null;
  modo_acao?: string | null;
  funcao_completa?: string | null;
  b2b_enabled?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  produto: Produto | null;
  origem?: "protocolos" | "app_mobile";
}

const ADMIN_ROLES = ["administrador", "gestor"];
const TECH_ROLES = ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo"];
const SOURCE_VIEW_ROLES = ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo", "gestor_comercial"];

export function ProductTechnicalProfileDialog({ open, onOpenChange, produto, origem = "protocolos" }: Props) {
  const { role } = useAuth();
  // Contrato: catálogo global é somente consulta para perfis de empresa.
  const canEditFull: boolean = TENANT_CAN_EDIT_GLOBAL_CATALOG;
  const canSeeHistory = role ? TECH_ROLES.includes(role) : false;
  const canSeeAudit = role ? ADMIN_ROLES.includes(role) : false;
  const canSeeSources = role ? SOURCE_VIEW_ROLES.includes(role) : false;
  const canEditSources = canEditFull;
  const canDeleteSources = false;
  const isAdminOrGestor = role ? ADMIN_ROLES.includes(role) : false;

  const { data, isLoading, isError, isSuccess, isFetching, refetch } = useProductProfile(produto?.id);
  const upsert = useUpsertProductProfile();
  const log = useLogCatalogAccess();
  const { hasSources } = useEffectiveCatalogSources("produto", produto?.id, data?.profile?.id);

  const [form, setForm] = useState<ProductFormState>(() => buildProductFormDefaults(produto));

  const [previaLoading, setPreviaLoading] = useState(false);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [confirmNoSourceOpen, setConfirmNoSourceOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  useEffect(() => {
    if (open && produto) log({ entidade_tipo: "produto", entidade_id: produto.id, origem });
  }, [open, produto, log, origem]);

  // CAT-09: o estado é sempre substituído por completo — nunca herda a ficha anterior.
  useEffect(() => {
    if (isError) return;
    if (!produto) {
      setForm(emptyProductForm());
      return;
    }
    if (isSuccess && data?.profile) {
      setForm(mapProductProfileToForm(data.profile));
      return;
    }
    setForm(buildProductFormDefaults(produto));
  }, [produto?.id, produto, data?.profile, isError, isSuccess]);


  useEffect(() => {
    if (open && produto && canSeeAudit && data?.profile?.id) {
      (supabase as any)
        .from("catalog_technical_audit_logs")
        .select("id, acao, usuario_id, created_at")
        .eq("entidade_tipo", "ficha_produto")
        .eq("entidade_id", data.profile.id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => setAuditLog(data ?? []));
    }
  }, [open, produto, canSeeAudit, data?.profile?.id]);

  if (!produto) return null;

  const validateApproval = () => {
    const missing: string[] = [];
    if (!form.resumo_curto.trim()) missing.push("Resumo curto");
    if (!form.explicacao_tecnica.trim()) missing.push("Explicação técnica");
    if (!form.explicacao_produtor.trim()) missing.push("Linguagem para o produtor");
    if (!form.beneficio_combinado.trim()) missing.push("Benefício combinado");
    if (!form.cuidados_aplicacao.trim()) missing.push("Cuidados de aplicação");
    return missing;
  };


  const handleSaveWithStatus = async (status: "rascunho" | "em_revisao" | "arquivado") => {
    if (!canEditFull) return;
    try {
      const payload: any = { produto_id: produto.id, ...form, status_validacao: status };
      await upsert.mutateAsync(payload);
      setForm((f) => ({ ...f, status_validacao: status }));
      await refetch();
      toast.success(
        status === "rascunho" ? "Rascunho salvo" :
        status === "em_revisao" ? "Enviado para revisão" :
        "Ficha arquivada",
      );
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar ficha");
    }
  };

  const gerarPrevia = async () => {
    setPreviaLoading(true);
    try {
      const texto = await gerarPreviaBeneficioCombinado(produto.id);
      setForm((f) => ({ ...f, beneficio_combinado: texto }));
      toast.success("Prévia gerada — revise antes de salvar");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPreviaLoading(false);
    }
  };

  const copyResumoB2B = async () => {
    const linhas = [
      `${produto.nome}${produto.codigo ? ` [${produto.codigo}]` : ""}`,
      form.resumo_curto && `Resumo: ${form.resumo_curto}`,
      form.explicacao_b2b && `B2B: ${form.explicacao_b2b}`,
      form.beneficio_combinado && `Benefício combinado: ${form.beneficio_combinado}`,
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(linhas);
    toast.success("Resumo B2B copiado");
  };

  const ehReadOnly = (_field: "b2b" | "full") => !canEditFull;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap break-words">
            Ficha técnica — {produto.nome}
            <TechnicalProfileStatusBadge status={data?.profile?.status_validacao ?? null} />
            {produto.b2b_enabled && <Badge variant="outline" className="text-[10px]">B2B</Badge>}
          </DialogTitle>
          <DialogDescription className="break-words">
            {produto.codigo && <span className="font-mono">{produto.codigo} · </span>}{produto.tipo}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <ProfileLoadErrorState busy={isFetching} onRetry={() => { void refetch(); }} />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3 min-w-0">
          <ProfileStatusBanner
            status={data?.profile?.status_validacao ?? null}
            b2bEnabled={produto.b2b_enabled}
            hasExplicacaoB2B={!!form.explicacao_b2b.trim()}
            showInternalApprovalMarkers={isAdminOrGestor}
          />
          <Tabs defaultValue="resumo" className="mt-2 min-w-0">
            <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1">
              <TabsTrigger value="resumo" className="whitespace-nowrap px-2.5 py-1 text-xs">Resumo</TabsTrigger>
              <TabsTrigger value="composicao" className="whitespace-nowrap px-2.5 py-1 text-xs">Composição</TabsTrigger>
              <TabsTrigger value="beneficio" className="whitespace-nowrap px-2.5 py-1 text-xs">Benefício</TabsTrigger>
              <TabsTrigger value="indic" className="whitespace-nowrap px-2.5 py-1 text-xs">Indicações</TabsTrigger>
              <TabsTrigger value="alvos" className="whitespace-nowrap px-2.5 py-1 text-xs">Alvos</TabsTrigger>
              <TabsTrigger value="culturas" className="whitespace-nowrap px-2.5 py-1 text-xs">Culturas</TabsTrigger>
              <TabsTrigger value="produtor" className="whitespace-nowrap px-2.5 py-1 text-xs">Produtor</TabsTrigger>
              <TabsTrigger value="b2b" className="whitespace-nowrap px-2.5 py-1 text-xs">B2B</TabsTrigger>
              <TabsTrigger value="cuidados" className="whitespace-nowrap px-2.5 py-1 text-xs">Cuidados</TabsTrigger>
              {canSeeSources && <TabsTrigger value="fontes" className="whitespace-nowrap px-2.5 py-1 text-xs">Fontes</TabsTrigger>}
              {canSeeHistory && <TabsTrigger value="historico" className="whitespace-nowrap px-2.5 py-1 text-xs">Histórico</TabsTrigger>}
              {canSeeAudit && <TabsTrigger value="auditoria" className="whitespace-nowrap px-2.5 py-1 text-xs">Auditoria</TabsTrigger>}
            </TabsList>

            <TabsContent value="resumo" className="space-y-3 pt-3 min-w-0">
              <ProfileFieldAI label="Resumo curto" rows={4} value={form.resumo_curto} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, resumo_curto: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="resumo_curto" canGenerateAI={canEditFull} />
              <ProfileFieldAI label="Explicação técnica" rows={5} value={form.explicacao_tecnica} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, explicacao_tecnica: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="explicacao_tecnica" canGenerateAI={canEditFull} />
            </TabsContent>

            <TabsContent value="composicao" className="pt-3">
              <ProductFormulaBenefits composicao={data?.composicao ?? []} />
            </TabsContent>

            <TabsContent value="beneficio" className="space-y-2 pt-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Benefício combinado oficial</Label>
                {canEditFull && (
                  <Button size="sm" variant="outline" onClick={gerarPrevia} disabled={previaLoading}>
                    <Sparkles className="h-3 w-3 mr-1" />
                    {previaLoading ? "Gerando..." : "Gerar prévia com base na composição"}
                  </Button>
                )}
              </div>
              <Textarea rows={10} value={form.beneficio_combinado} readOnly={ehReadOnly("full")} onChange={(e) => setForm({ ...form, beneficio_combinado: e.target.value })} />
              {!data?.profile?.beneficio_combinado && form.beneficio_combinado && (
                <Alert className="border-amber-200 bg-amber-50">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">Prévia automática. Revise e aprove antes de publicar.</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="indic" className="space-y-3 pt-3 min-w-0">
              <ProfileFieldAI label="Indicações de uso" rows={5} value={form.indicacoes_uso} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, indicacoes_uso: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="indicacoes_uso" canGenerateAI={canEditFull} />
              <ProfileFieldAI label="Janela de aplicação" rows={3} value={form.janela_aplicacao} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, janela_aplicacao: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="janela_aplicacao" canGenerateAI={canEditFull} />
            </TabsContent>

            <TabsContent value="alvos" className="space-y-2 pt-3">
              <TargetsManager kind="produto" parentId={produto.id} canEdit={canEditFull} />
            </TabsContent>

            <TabsContent value="culturas" className="space-y-2 pt-3">
              <CropsManager kind="produto" parentId={produto.id} canEdit={canEditFull} />
            </TabsContent>

            <TabsContent value="produtor" className="space-y-3 pt-3 min-w-0">
              <ProfileFieldAI label="Linguagem para o produtor" rows={8} value={form.explicacao_produtor} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, explicacao_produtor: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="explicacao_produtor" canGenerateAI={canEditFull} />
            </TabsContent>

            <TabsContent value="b2b" className="space-y-3 pt-3 min-w-0">
              <ProfileFieldAI label="Linguagem para parceiro B2B" rows={8} value={form.explicacao_b2b} readOnly={ehReadOnly("b2b")} onChange={(v) => setForm({ ...form, explicacao_b2b: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="explicacao_b2b" canGenerateAI={canEditFull} />
            </TabsContent>


            <TabsContent value="cuidados" className="space-y-3 pt-3 min-w-0">
              <ProfileFieldAI label="Cuidados na aplicação" rows={5} value={form.cuidados_aplicacao} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, cuidados_aplicacao: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="cuidados_aplicacao" canGenerateAI={canEditFull} />
              <ProfileFieldAI label="Compatibilidade" rows={3} value={form.compatibilidade} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, compatibilidade: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="compatibilidade" canGenerateAI={canEditFull} />
              <ProfileFieldAI label="Observações regulatórias" rows={3} value={form.observacoes_regulatorias} readOnly={ehReadOnly("full")} onChange={(v) => setForm({ ...form, observacoes_regulatorias: v })}
                entidadeTipo="produto" entidadeId={produto.id} campo="observacoes_regulatorias" canGenerateAI={canEditFull} />
            </TabsContent>

            {canSeeSources && (
              <TabsContent value="fontes" className="pt-3">
                <SourcesManager
                  entidadeTipo="produto"
                  entidadeId={produto.id}
                  canEdit={canEditSources}
                  canDelete={canDeleteSources}
                />
              </TabsContent>
            )}

            {canSeeHistory && (
              <TabsContent value="historico" className="pt-3">
                <VersoesHistoricoTab entidadeTipo="produto" entidadeId={produto.id} canApprove={false} />
              </TabsContent>
            )}

            {canSeeAudit && (
              <TabsContent value="auditoria" className="pt-3">
                <div className="space-y-1 max-h-72 overflow-y-auto text-xs">
                  {auditLog.length === 0 && <p className="text-muted-foreground">Sem eventos.</p>}
                  {auditLog.map((a) => (
                    <div key={a.id} className="flex items-center justify-between border-b py-1">
                      <span className="uppercase">{a.acao}</span>
                      <span className="text-muted-foreground">{formatDateTimeDisplay(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-3 mt-2">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={copyResumoB2B}>Copiar resumo B2B</Button>
            {!isError && canEditFull && data?.profile?.id && (
              <ReturnToReviewButton kind="produto" profileId={data.profile.id} onDone={refetch} />
            )}
            {!isError && canEditFull && (
              <>
                <Button size="sm" variant="outline" disabled={upsert.isPending}
                  onClick={() => handleSaveWithStatus("rascunho")}>
                  Salvar rascunho
                </Button>
                <Button size="sm" variant="outline" disabled={upsert.isPending}
                  onClick={() => handleSaveWithStatus("em_revisao")}>
                  Enviar para revisão
                </Button>
                <Button size="sm" variant="outline" disabled={upsert.isPending}
                  onClick={() => handleSaveWithStatus("arquivado")}>
                  Arquivar
                </Button>
                <Button size="sm" disabled={upsert.isPending}
                  onClick={() => {
                    if (!data?.profile?.id) {
                      toast.error("Salve a ficha como rascunho ou envie para revisão antes de aprovar.");
                      return;
                    }
                    if (!data?.composicao || data.composicao.length === 0) {
                      toast.error("Produto sem composição microbiológica. Cadastre a formulação antes de aprovar a ficha técnica.");
                      return;
                    }
                    const missing = validateApproval();
                    if (missing.length > 0) { toast.error("Preencha antes de aprovar: " + missing.join(", ")); return; }
                    if (!hasSources && !isAdminOrGestor) {
                      toast.error("Esta ficha não possui fonte técnica vinculada. Cadastre ao menos uma fonte antes da aprovação.");
                      return;
                    }
                    if (!hasSources && isAdminOrGestor) { setConfirmNoSourceOpen(true); return; }
                    setApprovalOpen(true);
                  }}>
                  Aprovar ficha
                </Button>
              </>
            )}
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground italic border-t pt-2">
            As recomendações de bioinsumos exigem avaliação técnica e prescrição agronômica conforme cultura, alvo, ambiente, histórico da área e manejo adotado.
          </p>
        </div>
      </DialogContent>

      <AlertDialog open={confirmNoSourceOpen} onOpenChange={setConfirmNoSourceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar ficha sem fonte técnica?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ficha não possui fonte técnica vinculada. Recomenda-se cadastrar ao menos uma fonte antes da aprovação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmNoSourceOpen(false);
                setApprovalOpen(true);
              }}
            >
              Continuar para checklist
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApprovalChecklistDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        kind="produto"
        profileId={data?.profile?.id ?? null}
        approvedWithoutSource={!hasSources}
        items={[
          { key: "resumo", label: "Resumo técnico revisado", required: true },
          { key: "composicao", label: "Composição conferida (formulação)", required: true },
          { key: "beneficio", label: "Benefício combinado revisado", required: true },
          { key: "tecnica", label: "Explicação técnica revisada", required: true },
          { key: "produtor", label: "Explicação para produtor revisada", required: true },
          { key: "b2b", label: "Explicação B2B revisada", required: !!produto.b2b_enabled },
          { key: "alvos", label: "Alvos revisados", required: true },
          { key: "culturas", label: "Culturas revisadas", required: false },
          hasSources
            ? { key: "fontes", label: "Fontes revisadas", required: true }
            : { key: "sem_fonte", label: "Estou ciente de que esta ficha será aprovada sem fonte técnica vinculada", required: true },
          { key: "cuidados", label: "Cuidados revisados", required: true },
        ] satisfies ChecklistItem[]}
        onConfirm={async () => {
          setForm((f) => ({ ...f, status_validacao: "aprovado" }));
          await refetch();
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
