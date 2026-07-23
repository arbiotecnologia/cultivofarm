/**
 * Fase H4-A1 — Banner agregado de validade do certificado A1 ativo.
 *
 * Somente leitura. Consome `useFiscalCertificates` (view sanitizada) e
 * NUNCA renderiza PFX, senha, `object_path`, storage URL, fingerprint
 * completo ou qualquer segredo. Expõe apenas:
 *   - dias restantes (número inteiro)
 *   - nome de exibição do certificado (`display_name`)
 *   - texto neutro em pt-BR
 *
 * Estados:
 *   - `expired`: bloqueia homologação (destructive).
 *   - `expiring_soon` (<=30 dias): atenção, não bloqueia.
 *   - `unknown`: validade não pôde ser verificada.
 *   - `valid` ou `none`: banner não é renderizado.
 */
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CircleAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useFiscalCertificates } from "@/hooks/useFiscalCertificates";
import {
  summarizeCertificateExpiry,
  type CertExpirySummary,
} from "@/lib/fiscal/certificateExpiryStatus";
import { CERTIFICADO_A1_DEEP_LINK } from "@/lib/fiscal/companyMissingFields";

export interface CertificadoValidadeBannerProps {
  companySettingsId: string | null;
  /** Destino da ação "Ir para certificados". Default = A1 na aba certificado. */
  actionHref?: string;
  className?: string;
  /**
   * Quando `true` (Central de Homologação), o banner também é renderizado
   * para os estados "sem certificado" (pendente) e "válido" (>30 dias, ok).
   * Padrão `false`: silencioso quando não há alerta a fazer (uso inline).
   */
  showAllStates?: boolean;
}

const DEFAULT_HREF = CERTIFICADO_A1_DEEP_LINK;

function daysLabel(days: number): string {
  if (days === 0) return "expira hoje";
  if (days === 1) return "expira em 1 dia";
  if (days < 0) return `expirado há ${Math.abs(days)} dia(s)`;
  return `expira em ${days} dia(s)`;
}

type RenderStatus = "expired" | "expiring_soon" | "unknown" | "none" | "valid";
interface RenderableSummary extends CertExpirySummary { status: RenderStatus }

function shouldRender(s: CertExpirySummary, showAllStates: boolean): s is RenderableSummary {
  if (s.status === "expired" || s.status === "expiring_soon" || s.status === "unknown") return true;
  if (showAllStates && (s.status === "none" || s.status === "valid")) return true;
  return false;
}

export default function CertificadoValidadeBanner({
  companySettingsId,
  actionHref,
  className,
  showAllStates = false,
}: CertificadoValidadeBannerProps) {
  const q = useFiscalCertificates(companySettingsId);
  // Sem contexto de empresa ou em loading/erro: silencioso — outras seções sinalizam.
  if (!companySettingsId || q.isLoading || q.isError || !q.data) return null;

  const summary = summarizeCertificateExpiry(q.data);
  if (!shouldRender(summary, showAllStates)) return null;

  const href = actionHref ?? DEFAULT_HREF;
  const variant: "default" | "destructive" =
    summary.status === "expired" ? "destructive" : "default";
  const Icon =
    summary.status === "expired" ? AlertTriangle
    : summary.status === "expiring_soon" ? CircleAlert
    : summary.status === "valid" ? ShieldCheck
    : ShieldQuestion;

  const title =
    summary.status === "expired"
      ? "Certificado digital expirado — homologação bloqueada"
    : summary.status === "expiring_soon"
      ? "Certificado digital próximo do vencimento"
    : summary.status === "none"
      ? "Certificado digital pendente"
    : summary.status === "valid"
      ? "Certificado digital em dia"
      : "Validade do certificado não verificada";

  const detail =
    summary.status === "none"
      ? "Nenhum certificado A1 ativo foi registrado para esta empresa."
    : summary.status === "unknown"
      ? "Não foi possível confirmar a data de validade a partir dos metadados atuais."
    : summary.worstDisplayName && summary.worstDaysRemaining !== null
      ? `${summary.worstDisplayName}: ${daysLabel(summary.worstDaysRemaining)}.`
    : summary.worstDaysRemaining !== null
      ? `Certificado ativo ${daysLabel(summary.worstDaysRemaining)}.`
      : "Verifique o certificado ativo.";

  const followUp =
    summary.status === "expired"
      ? "Substitua o certificado A1 ou registre um novo para retomar a homologação."
    : summary.status === "expiring_soon"
      ? "Providencie a renovação antes do vencimento; a homologação ainda pode prosseguir."
    : summary.status === "none"
      ? "Cadastre um certificado A1 para prosseguir com a homologação."
    : summary.status === "valid"
      ? "Nenhuma ação necessária no momento."
      : "Abra a seção de certificados para reenviar os metadados ou substituir o arquivo.";

  return (
    <Alert
      variant={variant}
      data-testid="fiscal-cert-validity-banner"
      data-status={summary.status}
      className={className}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-xs space-y-1">
        <div>{detail}</div>
        <div>{followUp}</div>
        <div>
          <Link
            to={href}
            className="underline underline-offset-2"
            aria-label="Ir para a seção de certificado digital"
            data-testid="fiscal-cert-validity-action"
          >
            Ir para certificado digital
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
}
