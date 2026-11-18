import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { useProductProfile, useUpsertProductProfile, useProductDocumentaryEvidence } from "@/hooks/useProductProfile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DraftExitConfirmation } from "@/components/catalogo/DraftExitConfirmation";
import { DocumentaryAI } from "./catalog/DocumentaryAI";
import { ProductEvidencePanel } from "./catalog/ProductEvidencePanel";
import { ProductFormulaBenefits } from "./ProductFormulaBenefits";
import { TechnicalProfileStatusBadge } from "./TechnicalProfileStatusBadge";
import { ProfileFieldAI } from "./catalog/ProfileFieldAI";
import { ProfileLoadErrorState } from "./catalog/ProfileLoadErrorState";
import { TargetsManager } from "./catalog/TargetsManager";
import { CropsManager } from "./catalog/CropsManager";
import { SourcesManager } from "./catalog/SourcesManager";
import { VersoesHistoricoTab } from "./catalog/VersoesHistoricoTab";
import { ProductDossierManagement } from "@/components/fiscal/ProductDossierManagement";
import { PRODUCT_DOCUMENTARY_FIELDS, productResearchIdentity } from "@/lib/catalogo/productDocumentary";
import { buildProductFormDefaults, mapProductProfileToForm, type ProductFormState } from "@/lib/catalogo/fichaFormDefaults";
import { DOCUMENTARY_LABELS } from "@/lib/catalogo/documentaryLabels";
import type { DocumentaryEvidence } from "@/lib/catalogo/documentarySuggestions";
import { useProductResearchDossier } from "@/hooks/useProductResearchDossier";
import { toast } from "sonner";

interface Produto {
  id: string; codigo: string | null; nome: string; tipo: string;
  descricao?: string | null; modo_acao?: string | null; funcao_completa?: string | null;
  owner_organization_id?: string | null; b2b_enabled?: boolean;
}
interface Props {
  open: boolean; onOpenChange(v: boolean): void; produto: Produto | null;
  origem?: "protocolos" | "app_mobile"; embedded?: boolean; onDirtyChange?(dirty: boolean): void;
}
const groups = {
  resumo: ["resumo_curto", "explicacao_tecnica"],
  uso: ["indicacoes_uso", "janela_aplicacao", "cuidados_aplicacao", "compatibilidade", "beneficio_combinado"],
  b2b: ["explicacao_produtor", "explicacao_b2b"],
} as const;

export function ProductTechnicalProfileDialog(props: Props) {
  const editor = useTenantCatalogEditor();
  if (!props.produto || !props.open) return null;
  return <ProductFicha key={`${editor.scope}:${props.produto.id}`} {...props} produto={props.produto} />;
}
function ProductFicha({ open, onOpenChange, produto, embedded, onDirtyChange }: Props & { produto: Produto }) {
  const { profile, roles = [] } = useAuth();
  const editor = useTenantCatalogEditor();
  const own = !!produto.owner_organization_id && produto.owner_organization_id === profile?.organization_id;
  const writable = own && editor.canEdit;
  const query = useProductProfile(produto.id);
  const evidenceQuery = useProductDocumentaryEvidence(produto.id, own);
  const dossier = useProductResearchDossier(produto.id, own && editor.ready);
  const save = useUpsertProductProfile();
  const [form, setForm] = useState<ProductFormState>(() => buildProductFormDefaults(produto));
  const [evidence, setEvidence] = useState<DocumentaryEvidence[]>([]);
  const [dirty, setDirty] = useState(false);
  const [exit, setExit] = useState(false);
  const [section, setSection] = useState("resumo");
  const [dossierBlocked, setDossierBlocked] = useState(false);
  const observed = useRef<NonNullable<typeof query.data>["profile"]>(null);
  const baseline = useRef<ProductFormState>(buildProductFormDefaults(produto));
  const hydrated = useRef(false);
  const lock = useRef(false);
  const [versionMismatch, setVersionMismatch] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(dirty || dossierBlocked); }, [dirty, dossierBlocked, onDirtyChange]);
  useEffect(() => {
    if (hydrated.current || !query.isSuccess || (own && !evidenceQuery.isSuccess)) return;
    if (evidenceQuery.profileRevision && (evidenceQuery.profileRevision !== query.data?.profile?.updated_at || evidenceQuery.profileId !== query.data?.profile?.id)) {
      setVersionMismatch(true);
      return;
    }
    setVersionMismatch(false);
    observed.current = query.data?.profile ?? null;
    baseline.current = query.data?.profile ? mapProductProfileToForm(query.data.profile) : buildProductFormDefaults(produto);
    setForm(baseline.current);
    setEvidence((evidenceQuery.data ?? []) as DocumentaryEvidence[]);
    hydrated.current = true;
  }, [query.isSuccess, query.data, evidenceQuery.isSuccess, evidenceQuery.data, evidenceQuery.profileRevision, evidenceQuery.profileId, own, produto]);
  const change = (fields: Record<string, string>) => { if (lock.current || !writable) return; setDirty(true); setForm(f => ({ ...f, ...fields })); };
  const submit = async () => {
    if (lock.current || dossierBlocked || !writable || !hydrated.current || query.isError || evidenceQuery.isError) return;
    lock.current = true;
    const current = editor.capture();
    const snapshot = { ...form };
    try {
      const ack = await save.mutateAsync({ ...snapshot, produto_id: produto.id, observedProfile: observed.current,
        documentaryEvidence: evidence.length || evidenceQuery.data?.length ? evidence : undefined, status_validacao: observed.current?.status_validacao ?? "rascunho" });
      if (!alive.current || !current()) return;
      observed.current = { ...observed.current, ...snapshot, produto_id: produto.id, id: ack.id, updated_at: ack.updated_at } as NonNullable<typeof observed.current>;
      setDirty(false);
      baseline.current = snapshot;
      toast.success("Conteúdo e fontes salvos");
    } catch (error) { if (alive.current && current()) toast.error(error instanceof Error ? error.message : "Salvamento não confirmado. Rascunho preservado."); }
    finally { lock.current = false; }
  };
  const content = <>
    <header className="space-y-2"><h2 className="text-xl font-semibold break-words">{produto.nome}</h2><p className="text-muted-foreground">{produto.codigo ?? "Sem código"} · {produto.tipo}</p><TechnicalProfileStatusBadge status={query.data?.profile?.status_validacao ?? null} /></header>
    {query.isError || evidenceQuery.isError || versionMismatch ? <ProfileLoadErrorState busy={query.isFetching} onRetry={() => { void query.refetch(); void evidenceQuery.refetch(); }} /> : !hydrated.current ? <p role="status">Carregando ficha…</p> :
      <Tabs value={section} onValueChange={value => { if (dossierBlocked || save.isPending) { toast.error("Conclua ou cancele as alterações do dossiê antes de sair."); return; } setSection(value); }} className="min-w-0">
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 w-full">
          <TabsTrigger value="resumo">Características técnicas</TabsTrigger><TabsTrigger value="composicao">Composição</TabsTrigger>
          <TabsTrigger value="uso">Uso agronômico</TabsTrigger><TabsTrigger value="b2b">B2B</TabsTrigger>
          <TabsTrigger value="ia">Conteúdo / IA</TabsTrigger><TabsTrigger value="fontes">Fontes e histórico</TabsTrigger>
          {own && roles.some(r => ["administrador", "gestor", "financeiro"].includes(r)) && <TabsTrigger value="dossier">Dossiê regulatório</TabsTrigger>}
        </TabsList>
        {(Object.entries(groups) as [keyof typeof groups, readonly (keyof ProductFormState)[]][]).map(([section, fields]) =>
          <TabsContent value={section} key={section} className="space-y-4">
            {fields.map(field => <ProfileFieldAI key={field} label={field === "explicacao_b2b" ? "Linguagem para parceiro B2B" : DOCUMENTARY_LABELS[field] ?? field} value={form[field]} readOnly={!writable || save.isPending || save.isError} onChange={value => change({ [field]: value })} canGenerateAI={false} />)}
            {section === "uso" && <><TargetsManager kind="produto" parentId={produto.id} canEdit={false} /><CropsManager kind="produto" parentId={produto.id} canEdit={false} /></>}
          </TabsContent>)}
        <TabsContent value="composicao"><ProductFormulaBenefits composicao={query.data?.composicao ?? []} /></TabsContent>
        <TabsContent value="ia" className="space-y-3">
          {dossier.isError && <p role="alert">Identificação documental indisponível. Não foi possível confirmar fabricante e registro.</p>}
          {writable && <DocumentaryAI key={JSON.stringify(dossier.data)} disabled={save.isPending || save.isError || dossier.isLoading || dossier.isError} identity={productResearchIdentity(produto, dossier.data)} values={{ ...form }} allowed={PRODUCT_DOCUMENTARY_FIELDS} onApply={change} onEvidence={accepted => setEvidence(old => [...old.filter(e => !accepted.some(a => a.field === e.field)), ...accepted])} />}
        </TabsContent>
        <TabsContent value="fontes" className="space-y-5"><ProductEvidencePanel evidence={evidence} values={{ ...form }} /><SourcesManager entidadeTipo="produto" entidadeId={produto.id} canEdit={false} canDelete={false} /><VersoesHistoricoTab entidadeTipo="produto" entidadeId={produto.id} canApprove={false} /></TabsContent>
        <TabsContent value="dossier"><ProductDossierManagement onBlockedChange={setDossierBlocked} product={{ product_id: produto.id, nome: produto.nome, codigo: produto.codigo, ativo: true, organization_name: "", owner_organization_id: produto.owner_organization_id ?? "" }} /></TabsContent>
      </Tabs>}
    <footer className="sticky bottom-0 bg-background border-t py-3 flex flex-wrap justify-end gap-2">
      {dirty && <Button type="button" variant="outline" disabled={save.isPending || save.isError} onClick={() => { setForm(baseline.current); setEvidence((evidenceQuery.data ?? []) as DocumentaryEvidence[]); setDirty(false); }}>Cancelar alterações do conteúdo</Button>}
      {!embedded && <Button variant="outline" disabled={save.isPending || dossierBlocked} onClick={() => dirty ? setExit(true) : onOpenChange(false)}>Fechar</Button>}
      {writable && <Button type="button" disabled={save.isPending || dossierBlocked || !hydrated.current || query.isError || evidenceQuery.isError} onClick={() => void submit()}>{save.isPending ? "Salvando…" : "Salvar conteúdo"}</Button>}
    </footer>
  </>;
  return <><DraftExitConfirmation open={exit} onOpenChange={setExit} onLeave={() => onOpenChange(false)} />{embedded ? <section className="space-y-4 min-w-0">{content}</section> : <Dialog open={open} onOpenChange={value => { if (save.isPending || dossierBlocked) return; if (!value && dirty) setExit(true); else onOpenChange(value); }}><DialogContent aria-describedby={undefined} className="max-w-6xl max-h-[94dvh] overflow-y-auto min-w-0"><DialogHeader><DialogTitle>Ficha do produto</DialogTitle></DialogHeader>{content}</DialogContent></Dialog>}</>;
}
