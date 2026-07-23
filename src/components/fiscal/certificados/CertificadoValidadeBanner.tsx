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
import { AlertTriangle, CircleAlert, ShieldQuestion } from "lucide-react";
import { useFiscalCertificates } from "@/hooks/useFiscalCertificates";
import {
  summarizeCertificateExpiry,
  type CertExpirySummary,
} from "@/lib/fiscal/certificateExpiryStatus";

export interface CertificadoValidadeBannerProps {
  companySettingsId: string | null;
  /** Destino da ação "Ir para certificados". Default = aba certificado. */
  actionHref?: string;
  className?: string;
}

const DEFAULT_HREF = "/configuracoes/fiscal/empresa?aba=certificado";

function daysLabel(days: number): string {
  if (days === 0) return "expira hoje";
  if (days === 1) return "expira em 1 dia";
  if (days < 0) return `expirado há ${Math.abs(days)} dia(s)`;
  return `expira em ${days} dia(s)`;
}

interface RenderableSummary extends CertExpirySummary {
  status: "expired" | "expiring_soon" | "unknown";
}

function shouldRender(s: CertExpirySummary): s is RenderableSummary {
  return s.status === "expired" || s.status === "expiring_soon" || s.status === "unknown";
}

export default function CertificadoValidadeBanner({
  companySettingsId,
  actionHref,
  className,
}: CertificadoValidadeBannerProps) {
  const q = useFiscalCertificates(companySettingsId);
  // Loading/erro: silencioso — outras seções já sinalizam.
  if (!companySettingsId || q.isLoading || q.isError || !q.data) return null;

  const summary = summarizeCertificateExpiry(q.data);
  if (!shouldRender(summary)) return null;

  const href = actionHref ?? DEFAULT_HREF;
  const variant = summary.status === "expired" ? "destructive" : "default";
  const Icon =
    summary.status === "expired" ? AlertTriangle
    : summary.status === "expiring_soon" ? CircleAlert
    : ShieldQuestion;

  const title =
    summary.status === "expired"
      ? "Certificado digital expirado — homologação bloqueada"
    : summary.status === "expiring_soon"
      ? "Certificado digital próximo do vencimento"
      : "Validade do certificado não verificada";

  const detail =
    summary.status === "unknown"
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
