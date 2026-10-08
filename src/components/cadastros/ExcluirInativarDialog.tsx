import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, Archive, Trash2, Info, ArrowRight, Download, FileArchive } from "lucide-react";
import { DepCounts, totalDeps, depLabel, getDepRoute } from "@/lib/cadastros";
import { supabase } from "@/integrations/supabase/client";
import { gerarBackupDocumentosCliente } from "@/lib/clienteDocumentos";
import { toast } from "sonner";
import { useCommercialRegistrationScope } from "@/hooks/useCommercialRegistrationScope";

type Entidade = "cliente" | "fazenda" | "talhão";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nome: string;
  entidade: Entidade;
  entidadeId: string;
  isAdmin: boolean;
  loadDeps: () => Promise<DepCounts>;
  onInativar: () => Promise<void>;
  onExcluir: () => Promise<void>;
  jaInativo?: boolean;
  onReativar?: () => Promise<void>;
}

export function ExcluirInativarDialog({
  open, onOpenChange, nome, entidade, entidadeId, isAdmin,
  loadDeps, onInativar, onExcluir, jaInativo, onReativar,
}: Props) {
  const [deps, setDeps] = useState<DepCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [docsCount, setDocsCount] = useState<number | null>(null);
  const [backupFeito, setBackupFeito] = useState(false);
  const [backupConfirmado, setBackupConfirmado] = useState(false);
  const [gerandoBackup, setGerandoBackup] = useState(false);
  const scope = useCommercialRegistrationScope();
  const actionLock = useRef(false);

  useEffect(() => {
    if (!open) {
      setDeps(null);
      setDocsCount(null);
      setBackupFeito(false);
      setBackupConfirmado(false);
      return;
    }
    setLoading(true);
    setDeps(null);
    setDocsCount(null);
    const current = scope.capture();
    let disposed = false;
    const live = () => current() && !disposed;
    loadDeps().then(value => { if (live()) setDeps(value); }).catch(() => {
      if (live()) toast.error("Não foi possível verificar vínculos. A exclusão permanece bloqueada.");
    }).finally(() => { if (live()) setLoading(false); });

    if (entidade === "cliente") {
      supabase
        .from("cliente_documentos")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", entidadeId)
        .then(({ count, error }) => { if (live() && !error) setDocsCount(count ?? 0); });
    } else {
      setDocsCount(0);
    }
    return () => { disposed = true; };
  }, [open, entidade, entidadeId, scope.scope]);

  const total = totalDeps(deps);
  const exigeBackup = entidade === "cliente" && (docsCount ?? 0) > 0;
  const backupOk = !exigeBackup || (backupFeito && backupConfirmado);
  const podeExcluir = scope.ready && isAdmin && deps !== null && docsCount === 0 && !loading && total === 0 && backupOk;
  const vinculos = deps ? Object.entries(deps).filter(([, v]) => Number(v) > 0) : [];

  const wrap = async (fn: () => Promise<void>, isExcluir = false) => {
    if (actionLock.current || !scope.ready || (isExcluir && !podeExcluir)) return;
    actionLock.current = true;
    const current = scope.capture();
    setActing(true);
    try {
      await fn();
      if (current()) onOpenChange(false);
    } catch {
      if (current()) toast.error("Não foi possível executar a ação. O cadastro foi mantido.");
    } finally {
      actionLock.current = false;
      setActing(false);
    }
  };

  const handleGerarBackup = async () => {
    if (!scope.ready || actionLock.current) return;
    actionLock.current = true;
    const current = scope.capture();
    setGerandoBackup(true);
    try {
      const r = await gerarBackupDocumentosCliente(entidadeId, nome);
      if (!current()) return;
      setBackupFeito(r.falhas.length === 0);
      toast.success(
        `Backup gerado (${r.baixados}/${r.totalDocs} arquivos).${r.falhas.length ? ` ${r.falhas.length} falha(s).` : ""}`
      );
    } catch {
      if (current()) toast.error("Não foi possível gerar o backup dos documentos.");
    } finally {
      actionLock.current = false;
      setGerandoBackup(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gerenciar {entidade}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <div><span className="font-medium text-foreground">{nome}</span></div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Verificando vínculos…</div>
              ) : deps === null ? (
                <p role="alert" className="text-sm text-destructive">Vínculos não verificados. Exclusão indisponível.</p>
              ) : total > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-amber-900 dark:text-amber-200">Possui histórico vinculado</p>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                            aria-label="Ver vínculos"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="start">
                          <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Vínculos encontrados
                          </div>
                          <ul className="py-1 max-h-72 overflow-y-auto">
                            {vinculos.map(([key, count]) => {
                              const route = getDepRoute(entidade, key, entidadeId);
                              const content = (
                                <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-accent rounded-sm transition-colors">
                                  <span className="capitalize text-foreground">{depLabel(key)}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="tabular-nums font-medium">{count}</span>
                                    {route && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                  </div>
                                </div>
                              );
                              return (
                                <li key={key} className="px-1">
                                  {route ? (
                                    <Link to={route} onClick={() => onOpenChange(false)}>
                                      {content}
                                    </Link>
                                  ) : content}
                                </li>
                              );
                            })}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Não é possível excluir — apenas inativar para preservar a rastreabilidade.</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum vínculo encontrado. É seguro excluir definitivamente.</p>
              )}

              {exigeBackup && total === 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-3">
                  <div className="flex gap-2">
                    <FileArchive className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        Este cliente possui {docsCount} documento(s) anexado(s)
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Antes de excluir, faça o backup dos documentos. Você não poderá recuperá-los depois.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGerarBackup}
                    disabled={gerandoBackup}
                    className="w-full"
                  >
                    {gerandoBackup ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    {backupFeito ? "Baixar backup novamente" : "Gerar e baixar backup (.zip)"}
                  </Button>
                  <label className={`flex items-start gap-2 text-xs ${backupFeito ? "" : "opacity-50 pointer-events-none"}`}>
                    <Checkbox
                      checked={backupConfirmado}
                      onCheckedChange={(v) => setBackupConfirmado(!!v)}
                      disabled={!backupFeito}
                      className="mt-0.5"
                    />
                    <span>Confirmo que realizei o download do backup dos documentos.</span>
                  </label>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <AlertDialogCancel disabled={acting}>Cancelar</AlertDialogCancel>
          {jaInativo && onReativar ? (
            <AlertDialogAction disabled={acting} onClick={(e) => { e.preventDefault(); wrap(onReativar); }}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
              Reativar
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              disabled={acting || loading}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={(e) => { e.preventDefault(); wrap(onInativar); }}
            >
              <Archive className="h-4 w-4 mr-2" />
              Inativar
            </AlertDialogAction>
          )}
          <AlertDialogAction
            disabled={!podeExcluir || acting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            title={!isAdmin ? "Apenas administradores" : total > 0 ? `Possui ${total} vínculo(s)` : ""}
            onClick={(e) => { e.preventDefault(); wrap(onExcluir, true); }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
