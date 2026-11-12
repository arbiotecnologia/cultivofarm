/**
 * H7 — Smokes autenticados de homologação, dentro da aba já existente
 * "Configuração Fiscal → Homologação fiscal". Sem rota nova e sem fluxo
 * paralelo.
 *
 * Dois cards admin-only:
 *   1. Autoteste do certificado A1 (criptografia em memória, inerte).
 *   2. Status do serviço da SEFAZ-MG em homologação (NFeStatusServico4).
 *
 * Nenhum dos dois emite, numera, gera documento ou altera configuração.
 * A tela mostra apenas indicadores sanitizados — nunca PFX, senha, PEM,
 * assinatura, fingerprint/serial, path, IV ou resposta bruta.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFiscalCompanySettings } from "@/hooks/useFiscalCompanySettings";
import { useFiscalCertificates } from "@/hooks/useFiscalCertificates";
import {
  useFiscalCertificateSelfTest,
  useHomologationNfeDrafts,
  useSefazStatusSmoke,
} from "@/hooks/useFiscalHomologationSmokes";
import {
  checkCertificateSelfTestGate,
  checkSmokeEnvironment,
  sanitizeSmokeError,
  SMOKE_ADMIN_ROLE,
} from "@/lib/fiscal/homologationSmokeGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

interface Props {
  companySettingsId: string | null;
}

function Indicador({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" aria-hidden />
      )}
      <span>{label}</span>
    </li>
  );
}

export default function SmokesHomologacaoSecao({ companySettingsId }: Props) {
  const { roles } = useAuth();
  const isAdmin = Array.isArray(roles) && roles.includes(SMOKE_ADMIN_ROLE);

  const settingsQuery = useFiscalCompanySettings({ enabled: isAdmin });
  const certificatesQuery = useFiscalCertificates(isAdmin ? companySettingsId : null);

  const settings = settingsQuery.data ?? null;
  const envInput = useMemo(
    () => ({
      isAdmin,
      fiscalEnvironment: settings?.fiscal_environment ?? null,
      nfeEnvironmentCode: settings
        ? String((settings as Record<string, unknown>).nfe_environment_code ?? "")
        : null,
      productionEnabled: settings?.production_enabled ?? null,
    }),
    [isAdmin, settings],
  );

  const certificate = useMemo(() => {
    const rows = certificatesQuery.data ?? [];
    const row = rows.find(
      (c) => c.environment === "HOMOLOGATION" && c.is_active && c.status === "AVAILABLE",
    );
    return row
      ? {
          environment: row.environment,
          status: row.status,
          isActive: row.is_active,
          daysUntilExpiration: row.days_until_expiration,
        }
      : null;
  }, [certificatesQuery.data]);

  const envGate = checkSmokeEnvironment(envInput);
  const certGate = checkCertificateSelfTestGate(envInput, certificate);

  const selfTest = useFiscalCertificateSelfTest();
  const sefazStatus = useSefazStatusSmoke();
  const draftsQuery = useHomologationNfeDrafts(isAdmin ? companySettingsId : null);
  const drafts = draftsQuery.data ?? [];
  const [draftId, setDraftId] = useState<string>("");
  useEffect(() => {
    // Seleção sempre explícita; descarta escolha que não pertence mais à lista.
    if (draftId && !drafts.some((d) => d.id === draftId)) setDraftId("");
  }, [drafts, draftId]);

  if (!isAdmin) return null;

  const selfTestData = selfTest.data;
  const statusData = sefazStatus.data;

  return (
    <div className="space-y-4" data-testid="fiscal-homologacao-smokes">
      <Card data-testid="fiscal-smoke-selftest">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Autoteste do certificado A1</CardTitle>
              <CardDescription>
                Verifica em memória, no servidor, se o cofre abre e se a chave assina.
                Não gera documento, não reserva numeração e não transmite nada.
              </CardDescription>
            </div>
            <Badge variant="outline">Homologação (tpAmb 2)</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            size="sm"
            onClick={() => selfTest.mutate()}
            disabled={!certGate.enabled || selfTest.isPending}
            data-testid="fiscal-smoke-selftest-btn"
          >
            {selfTest.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />Testando…</>
            ) : (
              <><ShieldCheck className="h-4 w-4 mr-2" aria-hidden />Testar certificado em memória</>
            )}
          </Button>

          {!certGate.enabled && (
            <p className="text-xs text-muted-foreground" data-testid="fiscal-smoke-selftest-blocked">
              {certGate.message}
            </p>
          )}

          {selfTest.isError && (
            <p className="text-sm text-destructive" data-testid="fiscal-smoke-selftest-error">
              {sanitizeSmokeError(selfTest.error)}
            </p>
          )}

          {selfTestData && (
            <div className="rounded border p-3 text-sm" data-testid="fiscal-smoke-selftest-result">
              <ul className="space-y-1.5">
                <Indicador label="Cofre de assinatura parseável" ok={selfTestData.bundleParsed} />
                <Indicador
                  label="Chave privada corresponde ao certificado"
                  ok={selfTestData.keyMatchesCertificate}
                />
                <Indicador label="Assinatura verificada" ok={selfTestData.signatureVerified} />
                <Indicador label="Certificado dentro da validade" ok={selfTestData.withinValidity} />
                <Indicador
                  label="Uso de chave para assinatura digital"
                  ok={selfTestData.keyUsageDigitalSignature}
                />
                <Indicador label="Nada foi persistido" ok={!selfTestData.persisted} />
                <Indicador label="Nada foi transmitido" ok={!selfTestData.transmitted} />
              </ul>
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                Dias restantes de validade: {selfTestData.daysUntilExpiry ?? "—"} · Ambiente{" "}
                {selfTestData.environmentCode ?? "—"} ·{" "}
                {new Date(selfTestData.checkedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="fiscal-smoke-sefaz-status">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">SEFAZ-MG — status do serviço em homologação</CardTitle>
              <CardDescription>
                Consulta apenas a disponibilidade do serviço (NFeStatusServico4) no
                ambiente de homologação. Nenhuma autorização, evento, inutilização,
                cancelamento ou documento é enviado.
              </CardDescription>
            </div>
            <Badge variant="outline">hnfe.fazenda.mg.gov.br</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="fiscal-smoke-status-draft" className="text-sm font-medium">
              Rascunho NF-e de homologação do emitente
            </label>
            <select
              id="fiscal-smoke-status-draft"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-11"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              disabled={!envGate.enabled || draftsQuery.isLoading || sefazStatus.isPending}
              data-testid="fiscal-smoke-status-draft"
            >
              <option value="">Selecione um rascunho</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Usado só para identificar o emitente e seu certificado. O rascunho não é enviado.
            </p>
            {draftsQuery.isSuccess && drafts.length === 0 && (
              <p className="text-xs text-muted-foreground" data-testid="fiscal-smoke-status-no-draft">
                Nenhum rascunho NF-e de homologação nesta empresa.
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => draftId && sefazStatus.mutate({ invoiceId: draftId })}
            disabled={!envGate.enabled || sefazStatus.isPending || !draftId}
            data-testid="fiscal-smoke-status-btn"
          >
            {sefazStatus.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />Consultando…</>
            ) : (
              "Consultar SEFAZ HML"
            )}
          </Button>

          {!envGate.enabled && (
            <p className="text-xs text-muted-foreground" data-testid="fiscal-smoke-status-blocked">
              {envGate.message}
            </p>
          )}

          {sefazStatus.isError && (
            <p className="text-sm text-destructive" data-testid="fiscal-smoke-status-error">
              {sanitizeSmokeError(sefazStatus.error)}
            </p>
          )}

          {statusData && (
            <div
              className="rounded border p-3 text-sm space-y-1"
              data-testid="fiscal-smoke-status-result"
            >
              <div>
                cStat: <strong className="tabular-nums">{statusData.cStat ?? "—"}</strong>
              </div>
              <div>xMotivo: {statusData.xMotivo ?? "—"}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                tpAmb {statusData.environmentCode ?? "—"} · {statusData.durationMs} ms ·{" "}
                {new Date(statusData.checkedAt).toLocaleString("pt-BR")}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
