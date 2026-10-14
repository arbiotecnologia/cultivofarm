import { TENANT_CAN_EDIT_GLOBAL_CATALOG } from "@/lib/catalogo/globalCatalogWriteContainment";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMicroorganismProfile, useUpsertMicroProfile } from "@/hooks/useMicroorganismProfile";
import { TechnicalProfileStatusBadge } from "./TechnicalProfileStatusBadge";
import { useLogCatalogAccess } from "@/hooks/useLogCatalogAccess";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
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
  buildMicroFormDefaults,
  emptyMicroForm,
  mapMicroProfileToForm,
  type MicroFormState,
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

interface Microrganismo {
  id: string;
  nome: string;
  nome_cientifico: string | null;
  funcao_agronomica: string | null;
  descricao: string | null;
  observacoes: string | null;
  tipo: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  micro: Microrganismo | null;
  origem?: "protocolos" | "app_mobile";
}

const ADMIN_ROLES = ["administrador", "gestor"];
const TECH_ROLES = ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo"];
const SOURCE_VIEW_ROLES = ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo", "gestor_comercial"];

export function MicroorganismTechnicalProfileDialog({ open, onOpenChange, micro, origem = "protocolos" }: Props) {
  const { role } = useAuth();
  // Contrato: catálogo global é somente consulta para perfis de empresa.
  // Caminho B2B-only (update_microorganism_b2b_description) removido: EXECUTE revogado.
  const canEditFull: boolean = TENANT_CAN_EDIT_GLOBAL_CATALOG;
  const canSeeHistory = role ? TECH_ROLES.includes(role) : false;
  const canSeeAudit = role ? ADMIN_ROLES.includes(role) : false;
  const canSeeSources = role ? SOURCE_VIEW_ROLES.includes(role) : false;
  const canEditSources = canEditFull;
  const canDeleteSources = false;
  const isAdminOrGestor = role ? ADMIN_ROLES.includes(role) : false;

  const { data, isLoading, isError, isSuccess, isFetching, refetch } = useMicroorganismProfile(micro?.id);
  const upsert = useUpsertMicroProfile();
  const log = useLogCatalogAccess();
  const { hasSources } = useEffectiveCatalogSources("micro", micro?.id, data?.profile?.id);

  const [form, setForm] = useState<MicroFormState>(() => buildMicroFormDefaults(micro));

  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [confirmNoSourceOpen, setConfirmNoSourceOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  useEffect(() => {
    if (open && micro) log({ entidade_tipo: "microrganismo", entidade_id: micro.id, origem });
  }, [open, micro, log, origem]);

  // CAT-09: o estado é sempre substituído por completo — nunca herda a ficha anterior.
  useEffect(() => {
    if (isError) return;
    if (!micro) {
      setForm(emptyMicroForm());
      return;
    }
    if (isSuccess && data?.profile) {
      setForm(mapMicroProfileToForm(data.profile));
      return;
    }
    setForm(buildMicroFormDefaults(micro));
  }, [micro?.id, micro, data?.profile, isError, isSuccess]);


  useEffect(() => {
    if (open && micro && canSeeAudit) {
      (supabase as any)
        .from("catalog_technical_audit_logs")
        .select("id, acao, usuario_id, created_at, entidade_tipo")
        .eq("entidade_tipo", "ficha_microrganismo")
        .eq("entidade_id", data?.profile?.id ?? "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => setAuditLog(data ?? []));
    }
  }, [open, micro, canSeeAudit, data?.profile?.id]);

  if (!micro) return null;

  const validateApproval = () => {
    const missing: string[] = [];
    if (!form.resumo_curto.trim()) missing.push("Resumo curto");
    if (!form.explicacao_tecnica.trim()) missing.push("Explicação técnica");
    if (!form.explicacao_produtor.trim()) missing.push("Linguagem para o produtor");
    if (!form.mecanismo_acao.trim()) missing.push("Mecanismo de ação");
    if (!form.beneficios_agronomicos.trim()) missing.push("Benefícios agronômicos");
    if (!form.observacoes_regulatorias.trim()) missing.push("Observações regulatórias");
    return missing;
  };


  const doSave = async () => {
    try {
      await upsert.mutateAsync({ microrganismo_id: micro.id, ...form });
      if (form.status_validacao === "aprovado" && (micro as any).b2b_enabled && !form.explicacao_b2b.trim()) {
        toast.warning("Aprovado tecnicamente, porém sem texto B2B.");
      } else {
        toast.success("Ficha técnica salva");
      }
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar ficha");
    }
  };

  const save = async () => {
    if (canEditFull && form.status_validacao === "aprovado") {
      const missing = validateApproval();
      if (missing.length > 0) {
        toast.error("Preencha antes de aprovar: " + missing.join(", "));
        return;
      }
      if (!hasSources) {
        if (!isAdminOrGestor) {
          toast.error("Esta ficha não possui fonte técnica vinculada. Cadastre ao menos uma fonte antes da aprovação.");
          return;
        }
        setConfirmNoSourceOpen(true);
        return;
      }
    }
    await doSave();
  };

  const handleSaveWithStatus = async (status: "rascunho" | "em_revisao" | "arquivado") => {
    if (!canEditFull) return;
    try {
      const payload = { microrganismo_id: micro.id, ...form, status_validacao: status };
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


  const copyResumo = async () => {
    const linhas = [
      `${micro.nome}${micro.nome_cientifico ? ` (${micro.nome_cientifico})` : ""}`,
      form.resumo_curto && `Resumo: ${form.resumo_curto}`,
      form.beneficios_agronomicos && `Benefícios: ${form.beneficios_agronomicos}`,
      form.cuidados_aplicacao && `Cuidados: ${form.cuidados_aplicacao}`,
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(linhas);
    toast.success("Resumo copiado");
  };





  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Ficha técnica — {micro.nome}
            <TechnicalProfileStatusBadge status={data?.profile?.status_validacao ?? null} />
          </DialogTitle>
          <DialogDescription className="italic">
            {micro.nome_cientifico} · {micro.tipo}
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
            b2bEnabled={(micro as any).b2b_enabled}
            hasExplicacaoB2B={!!form.explicacao_b2b.trim()}
            showInternalApprovalMarkers={isAdminOrGestor}
          />
          <Tabs defaultValue="resumo" className="mt-2 min-w-0">
            <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1">
              <TabsTrigger value="resumo" className="whitespace-nowrap px-2.5 py-1 text-xs">Resumo</TabsTrigger>
              <TabsTrigger value="atua" className="whitespace-nowrap px-2.5 py-1 text-xs">Como atua</TabsTrigger>
              <TabsTrigger value="beneficios" className="whitespace-nowrap px-2.5 py-1 text-xs">Benefícios</TabsTrigger>
              <TabsTrigger value="alvos" className="whitespace-nowrap px-2.5 py-1 text-xs">Alvos</TabsTrigger>
              <TabsTrigger value="culturas" className="whitespace-nowrap px-2.5 py-1 text-xs">Culturas</TabsTrigger>
              <TabsTrigger value="aplicacao" className="whitespace-nowrap px-2.5 py-1 text-xs">Aplicação</TabsTrigger>
              <TabsTrigger value="cuidados" className="whitespace-nowrap px-2.5 py-1 text-xs">Cuidados</TabsTrigger>
              <TabsTrigger value="produtor" className="whitespace-nowrap px-2.5 py-1 text-xs">Produtor</TabsTrigger>
              <TabsTrigger value="b2b" className="whitespace-nowrap px-2.5 py-1 text-xs">B2B</TabsTrigger>
              {canSeeSources && <TabsTrigger value="fontes" className="whitespace-nowrap px-2.5 py-1 text-xs">Fontes</TabsTrigger>}
              {canSeeHistory && <TabsTrigger value="historico" className="whitespace-nowrap px-2.5 py-1 text-xs">Histórico</TabsTrigger>}
              {canSeeAudit && <TabsTrigger value="auditoria" className="whitespace-nowrap px-2.5 py-1 text-xs">Auditoria</TabsTrigger>}
            </TabsList>

            <TabsContent value="resumo" className="space-y-3 pt-3">
              <ProfileFieldAI readOnly={!canEditFull} label="Resumo curto (consultivo)" rows={4} value={form.resumo_curto} onChange={(v: string) => setForm({ ...form, resumo_curto: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="resumo_curto" canGenerateAI={canEditFull} />
            </TabsContent>
            <TabsContent value="atua" className="space-y-3 pt-3">
              <ProfileFieldAI readOnly={!canEditFull} label="Mecanismo de ação" rows={5} value={form.mecanismo_acao} onChange={(v: string) => setForm({ ...form, mecanismo_acao: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="mecanismo_acao" canGenerateAI={canEditFull} />
              <ProfileFieldAI readOnly={!canEditFull} label="Explicação técnica" rows={5} value={form.explicacao_tecnica} onChange={(v: string) => setForm({ ...form, explicacao_tecnica: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="explicacao_tecnica" canGenerateAI={canEditFull} />
            </TabsContent>
            <TabsContent value="beneficios" className="space-y-3 pt-3">
              <ProfileFieldAI readOnly={!canEditFull} label="Benefícios agronômicos" rows={6} value={form.beneficios_agronomicos} onChange={(v: string) => setForm({ ...form, beneficios_agronomicos: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="beneficios_agronomicos" canGenerateAI={canEditFull} />
            </TabsContent>
            <TabsContent value="alvos" className="space-y-2 pt-3">
              <TargetsManager kind="micro" parentId={micro.id} canEdit={canEditFull} />
            </TabsContent>
            <TabsContent value="culturas" className="space-y-2 pt-3">
              <CropsManager kind="micro" parentId={micro.id} canEdit={canEditFull} />
            </TabsContent>

            <TabsContent value="aplicacao" className="space-y-3 pt-3">
              <ProfileFieldAI readOnly={!canEditFull} label="Indicações de uso" rows={4} value={form.indicacoes_uso} onChange={(v: string) => setForm({ ...form, indicacoes_uso: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="indicacoes_uso" canGenerateAI={canEditFull} />
              <ProfileFieldAI readOnly={!canEditFull} label="Compatibilidade" rows={3} value={form.compatibilidade} onChange={(v: string) => setForm({ ...form, compatibilidade: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="compatibilidade" canGenerateAI={canEditFull} />
              <ProfileFieldAI readOnly={!canEditFull} label="Armazenamento" rows={3} value={form.armazenamento} onChange={(v: string) => setForm({ ...form, armazenamento: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="armazenamento" canGenerateAI={canEditFull} />
            </TabsContent>
            <TabsContent value="cuidados" className="space-y-3 pt-3">
              <ProfileFieldAI readOnly={!canEditFull} label="Cuidados na aplicação" rows={5} value={form.cuidados_aplicacao} onChange={(v: string) => setForm({ ...form, cuidados_aplicacao: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="cuidados_aplicacao" canGenerateAI={canEditFull} />
              <ProfileFieldAI readOnly={!canEditFull} label="Observações regulatórias" rows={4} value={form.observacoes_regulatorias} onChange={(v: string) => setForm({ ...form, observacoes_regulatorias: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="observacoes_regulatorias" canGenerateAI={canEditFull} />
            </TabsContent>
            <TabsContent value="produtor" className="space-y-3 pt-3">
              <ProfileFieldAI readOnly={!canEditFull} label="Linguagem para o produtor" rows={6} value={form.explicacao_produtor} onChange={(v: string) => setForm({ ...form, explicacao_produtor: v })}
                entidadeTipo="microrganismo" entidadeId={micro.id} campo="explicacao_produtor" canGenerateAI={canEditFull} />
            </TabsContent>
            <TabsContent value="b2b" className="space-y-3 pt-3">
              <ProfileFieldAI
                label="Linguagem para parceiro B2B"
                rows={6}
                value={form.explicacao_b2b}
                readOnly={!canEditFull}
                onChange={(v: string) => setForm({ ...form, explicacao_b2b: v })}
                entidadeTipo="microrganismo"
                entidadeId={micro.id}
                campo="explicacao_b2b"
                canGenerateAI={canEditFull}
              />

            </TabsContent>

            {canSeeSources && (
              <TabsContent value="fontes" className="pt-3">
                <SourcesManager
                  entidadeTipo="microrganismo"
                  entidadeId={micro.id}
                  canEdit={canEditSources}
                  canDelete={canDeleteSources}
                />
              </TabsContent>
            )}
            {canSeeHistory && (
              <TabsContent value="historico" className="pt-3">
                <VersoesHistoricoTab entidadeTipo="microrganismo" entidadeId={micro.id} canApprove={false} />
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
            <Button variant="outline" size="sm" onClick={copyResumo}>Copiar resumo</Button>
            {!isError && canEditFull && data?.profile?.id && (
              <ReturnToReviewButton kind="micro" profileId={data.profile.id} onDone={refetch} />
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
        kind="micro"
        profileId={data?.profile?.id ?? null}
        approvedWithoutSource={!hasSources}
        items={[
          { key: "resumo", label: "Resumo técnico revisado", required: true },
          { key: "mecanismo", label: "Mecanismo de ação revisado", required: true },
          { key: "beneficios", label: "Benefícios agronômicos revisados", required: true },
          { key: "tecnica", label: "Explicação técnica revisada", required: true },
          { key: "produtor", label: "Explicação para produtor revisada", required: true },
          { key: "b2b", label: "Explicação B2B revisada", required: !!(micro as any).b2b_enabled },
          { key: "alvos", label: "Alvos revisados", required: true },
          hasSources
            ? { key: "fontes", label: "Fontes revisadas", required: true }
            : { key: "sem_fonte", label: "Estou ciente de que esta ficha será aprovada sem fonte técnica vinculada", required: true },
          { key: "cuidados", label: "Cuidados de aplicação revisados", required: true },
          { key: "regulatorias", label: "Observações regulatórias revisadas", required: true },
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
