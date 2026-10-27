import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import { OrigemAlertaError, useAlertasVinculaveis, useVincularOrigemAlerta, type AlertaVinculavel } from "@/hooks/useOrigemAlertaAgronomico";

const TIPO: Record<string, string> = { praga: "Praga", doenca: "Doença", daninha: "Planta daninha", nematoide: "Nematoide", estresse_hidrico: "Estresse hídrico" };
const RISCO: Record<string, string> = { baixo: "baixo", medio: "médio", alto: "alto", critico: "crítico" };

interface Props { registroId: string; locked: boolean; visitVersion: number | null | undefined; onUpdate: () => void }

/** Links an EXISTING agronomic alert of the same farm/plot to this visit. Never creates or retypes alerts. */
export function OrigemAlertaAgronomico({ registroId, locked, visitVersion, onUpdate }: Props) {
  const list = useAlertasVinculaveis(registroId, true);
  const link = useVincularOrigemAlerta(registroId);
  const [confirming, setConfirming] = useState<{ alerta: AlertaVinculavel; version: number } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const lock = useRef(false);
  useEffect(() => { setConfirming(null); attempt.current = null; lock.current = false; }, [link.scope]);

  const vinculadas = (list.data ?? []).filter(a => a.registro_origem_id === registroId);
  const candidatas = (list.data ?? []).filter(a => a.registro_origem_id === null);
  const unavailable = list.error instanceof OrigemAlertaError && list.error.outcome === "unavailable";

  const abrir = (alerta: AlertaVinculavel) => {
    if (locked || !link.ready || !Number.isSafeInteger(visitVersion) || !visitVersion) return;
    setConfirming({ alerta, version: visitVersion });
  };
  const confirmar = async () => {
    if (!confirming || lock.current || locked) return;
    const current = link.capture();
    const fingerprint = JSON.stringify([registroId, confirming.alerta.id, confirming.alerta.updated_at, confirming.version]);
    if (attempt.current && attempt.current.fingerprint !== fingerprint) attempt.current = null;
    attempt.current ??= { fingerprint, key: crypto.randomUUID() };
    lock.current = true;
    try {
      await link.mutateAsync({ alerta: confirming.alerta, registroId, expectedVisitVersion: confirming.version, requestId: attempt.current.key });
      if (!current()) return;
      attempt.current = null; setConfirming(null);
      toast.success("Alerta agronômico vinculado a esta visita.");
      onUpdate();
    } catch (error) {
      if (!current()) return;
      // Definitive rejection retires the key; uncertain keeps it for an identical retry.
      if (!(error instanceof OrigemAlertaError && error.outcome === "uncertain")) { attempt.current = null; setConfirming(null); void list.refetch(); }
      toast.error(error instanceof Error ? error.message : "Não foi possível vincular o alerta.");
    } finally { lock.current = false; }
  };

  return (
    <div className="space-y-1 border-t pt-2" data-testid="origem-alerta-agronomico">
      <p className="text-xs font-medium text-foreground">Alerta agronômico de origem</p>
      {unavailable ? (
        <p className="text-xs text-muted-foreground">{list.error?.message}</p>
      ) : list.isError ? (
        <p className="text-xs text-destructive">Não foi possível consultar os alertas desta fazenda.</p>
      ) : list.isLoading ? (
        <p className="text-xs text-muted-foreground">Consultando alertas…</p>
      ) : (
        <>
          {vinculadas.length === 0 && <p className="text-xs text-muted-foreground">Nenhum alerta agronômico vinculado a esta visita. O aviso do plano não substitui um alerta.</p>}
          {vinculadas.map(a => (
            <p key={a.id} className="text-xs text-muted-foreground">
              Vinculado: {TIPO[a.tipo_alerta] ?? a.tipo_alerta} · risco {RISCO[a.nivel_risco] ?? a.nivel_risco} · vence {a.data_vencimento ? formatDateDisplay(a.data_vencimento + "T12:00:00") : "sem data"}
            </p>
          ))}
          {!locked && candidatas.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span>{TIPO[a.tipo_alerta] ?? a.tipo_alerta} · risco {RISCO[a.nivel_risco] ?? a.nivel_risco}</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" disabled={link.isPending || !link.ready} onClick={() => abrir(a)}>
                <Link2 className="h-3 w-3 mr-1" />Vincular
              </Button>
            </div>
          ))}
        </>
      )}
      <AlertDialog open={!!confirming} onOpenChange={open => { if (!open && !link.isPending) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vincular alerta a esta visita?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && `${TIPO[confirming.alerta.tipo_alerta] ?? confirming.alerta.tipo_alerta}: esta visita passará a ser a origem do alerta. O tipo do alerta não muda.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={link.isPending}>Cancelar</AlertDialogCancel>
            <Button onClick={confirmar} disabled={link.isPending}>Confirmar vínculo</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
