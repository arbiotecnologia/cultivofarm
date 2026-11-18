import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { ExternalLink, Pencil, Plus, Trash2, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateDisplay } from "@/lib/date-utils";
import {
  CONFIDENCE_LABEL,
  CatalogSource,
  SOURCE_TYPE_LABEL,
  useCatalogSources,
  useDeleteCatalogSource,
  type CatalogSourceEntity,
} from "@/hooks/useCatalogSources";
import { SourceFormDialog } from "./SourceFormDialog";
import { safeSourceUrl } from '@/lib/catalogo/safeSourceUrl';

interface Props {
  entidadeTipo: CatalogSourceEntity;
  entidadeId: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

const confidenceClass = (c: string) =>
  c === "alto"
    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : c === "medio"
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200";

export function SourcesManager({ entidadeTipo, entidadeId, canEdit = false, canDelete = false }: Props) {
  const sourcesQuery = useCatalogSources(entidadeTipo, entidadeId);
  const sources = sourcesQuery.data ?? [];
  const hasData = sourcesQuery.data !== undefined;
  const del = useDeleteCatalogSource(entidadeTipo, entidadeId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogSource | null>(null);
  const [toDelete, setToDelete] = useState<CatalogSource | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: CatalogSource) => {
    setEditing(s);
    setFormOpen(true);
  };
  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Fonte removida");
      setToDelete(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover fonte");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          {hasData ? <>{sources.length} {sources.length === 1 ? "fonte cadastrada" : "fontes cadastradas"}</> : sourcesQuery.isError ? "Fontes indisponíveis" : "Carregando fontes…"}
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar fonte
          </Button>
        )}
      </div>

      {sourcesQuery.isError && (
        <div role="alert" className="rounded-md border border-destructive/40 p-3 text-xs space-y-2">
          <p>Não foi possível carregar as fontes técnicas{hasData ? " atualizadas; exibindo a última leitura válida" : ""}. A falha não significa ausência de fontes.</p>
          <Button size="sm" variant="outline" disabled={sourcesQuery.isFetching} onClick={() => { void sourcesQuery.refetch(); }}>Tentar novamente</Button>
        </div>
      )}
      {!hasData ? (
        sourcesQuery.isError ? null : (
        <div role="status" className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando fontes…
        </div>)
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma fonte técnica vinculada. Cadastre referências (artigos, Embrapa, fabricante, patentes etc.)
            para enriquecer e rastrear o conteúdo desta ficha.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium text-sm leading-tight">{s.fonte_titulo}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {SOURCE_TYPE_LABEL[s.fonte_tipo] ?? s.fonte_tipo}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${confidenceClass(s.nivel_confianca)}`}>
                        Confiança: {CONFIDENCE_LABEL[s.nivel_confianca] ?? s.nivel_confianca}
                      </Badge>
                      {s.idioma_original && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {s.idioma_original}
                        </Badge>
                      )}
                      {s.pais_origem && (
                        <Badge variant="outline" className="text-[10px]">
                          {s.pais_origem}
                        </Badge>
                      )}
                      {s.data_consulta && (
                        <span className="text-[10px] text-muted-foreground">
                          Consulta: {formatDateDisplay(s.data_consulta)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {safeSourceUrl(s.fonte_url) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        asChild
                        title="Abrir fonte"
                      >
                        <a href={safeSourceUrl(s.fonte_url) ?? undefined} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {s.fonte_url && !safeSourceUrl(s.fonte_url) && <span className="text-xs text-destructive">Link legado não seguro</span>}
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(s)}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setToDelete(s)}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {s.resumo_evidencia && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {s.resumo_evidencia}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canEdit && (
        <SourceFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          entidadeTipo={entidadeTipo}
          entidadeId={entidadeId}
          source={editing}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fonte?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A fonte "{toDelete?.fonte_titulo}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
