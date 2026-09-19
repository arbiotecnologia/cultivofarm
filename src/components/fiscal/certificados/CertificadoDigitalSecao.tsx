/**
 * Fase Fiscal 3.16.1 / 3.16.2-B / 3.16.2-C — Seção "Certificado Digital".
 *
 * Regras 3.16.2-C:
 *   - A seção é SEMPRE visível para quem tem permissão de rota (a aba já é
 *     controlada pela página). `canEdit` NÃO é usado para ocultar; somente
 *     `canManageCertificates` (papel administrador) libera ações de escrita.
 *   - Fingerprint SHA-256 é sempre mascarado: 4 primeiros + "…" + 4 últimos.
 *     Nenhum tooltip/title expõe o valor completo.
 *   - Serial é mascarado no centro.
 *   - Ambiente diferente de HOMOLOGATION é rotulado "Indisponível" e sem
 *     ação de escrita — nunca "Produção" nesta fase.
 *   - Erros da view/Edge são exibidos como
 *     "Cofre de certificados ainda não ativado neste ambiente".
 *   - Bridge indisponível: "Conector do sistema operacional não instalado".
 *   - Botão de detecção é rotulado "Atualizar detecção".
 *   - `statusBadge` mapeia `NOT_CONFIGURED` para "Não configurado" e faz
 *     fallback "Status indisponível". Nenhum enum cru vaza para a UI.
 *   - Após upload A1 bem-sucedido, refetch da lista (via `onUploaded`).
 */
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ShieldOff, KeyRound, Cpu, RefreshCw } from "lucide-react";
import UploadCertificadoA1 from "./UploadCertificadoA1";
import CertificadoValidadeBanner from "./CertificadoValidadeBanner";
import { useFiscalCertificates, useRevokeFiscalCertificate } from "@/hooks/useFiscalCertificates";
import { useRegisterOsCertificate } from "@/hooks/useRegisterOsCertificate";
import { probeOsBridge, listOsCertificatesSafe } from "@/lib/fiscal/certificateOsAdapter";
import type { FiscalOsBridgeStatus, FiscalOsCertificateMetadata } from "@/types/fiscalCertificateBridge";
import { toast } from "@/hooks/use-toast";

export interface CertificadoDigitalSecaoProps {
  companySettingsId: string;
  /** Papel administrador — libera upload, registro SO e revogação. */
  canManageCertificates: boolean;
  /**
   * Compat legado. IGNORADO para exibição desde 3.16.2-C: a aba é
   * controlada pela página. Somente `canManageCertificates` gate ações.
   */
  canEdit?: boolean;
}

/** Mascaramento visual seguro do fingerprint SHA-256. */
export function maskFingerprint(fp: string | null | undefined): string {
  if (!fp) return "—";
  const s = String(fp).replace(/\s+/g, "");
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Mascaramento visual do serial (mantém pontas, oculta o centro). */
export function maskSerial(serial: string | null | undefined): string {
  if (!serial) return "—";
  const s = String(serial).replace(/\s+/g, "");
  if (s.length <= 6) return "•".repeat(s.length);
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

/** Rótulo pt-BR para o ambiente exibido; nunca rotula outros como Produção. */
export function environmentLabel(env: string | null | undefined): string {
  return env === "HOMOLOGATION" ? "Homologação" : "Indisponível";
}

/** Mensagem única e neutra para falhas de leitura da view/Edge. */
export const VAULT_UNAVAILABLE_MESSAGE =
  "Cofre de certificados ainda não ativado neste ambiente";

/** Mensagem única quando o bridge nativo do SO não está presente. */
export const OS_BRIDGE_MISSING_MESSAGE =
  "Conector do sistema operacional não instalado";

function statusBadge(status: string | null | undefined, isActive: boolean) {
  if (status == null || status === "") {
    return <Badge variant="secondary">Status indisponível</Badge>;
  }
  if (!isActive || status === "REVOKED") return <Badge variant="outline">Revogado</Badge>;
  if (status === "EXPIRED") return <Badge variant="destructive">Expirado</Badge>;
  if (status === "AVAILABLE") return <Badge variant="default">Ativo</Badge>;
  if (status === "ERROR") return <Badge variant="destructive">Erro</Badge>;
  if (status === "NOT_CONFIGURED") return <Badge variant="secondary">Não configurado</Badge>;
  return <Badge variant="secondary">Status indisponível</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export default function CertificadoDigitalSecao({
  companySettingsId,
  canManageCertificates,
}: CertificadoDigitalSecaoProps) {
  const listQ = useFiscalCertificates(companySettingsId);
  const revoke = useRevokeFiscalCertificate();
  const revokeInFlight = useRef(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleRevoke(id: string) {
    if (!canManageCertificates || revokeInFlight.current) return;
    revokeInFlight.current = true;
    try {
      await revoke.mutateAsync({ certificateId: id, reason: "Revogado pelo administrador" });
      toast({ title: "Certificado revogado", description: "Material removido do cofre." });
    } catch (err) {
      toast({
        title: "Falha ao revogar",
        description: err instanceof Error ? err.message : "Erro inesperado.",
        variant: "destructive",
      });
    } finally {
      revokeInFlight.current = false;
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="fiscal-certificado-secao">
      <Alert>
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <AlertTitle>Certificado digital — homologação</AlertTitle>
        <AlertDescription className="text-xs">
          Apenas administradores podem carregar, registrar ou revogar certificados.
          O material de assinatura é cifrado no servidor (AES-256-GCM). A senha
          serve apenas para abrir o A1 e não é persistida. O conector nativo do sistema operacional
          expõe somente metadados sanitizados. Nenhum certificado carregado aqui
          autoriza emissão.
        </AlertDescription>
      </Alert>

      {/* H4-A3: no painel de certificados, evitamos banner duplicado para os
          estados none/valid — a lista logo abaixo já comunica ausência ou
          vigência. O banner permanece silencioso nesses estados e só aparece
          para expiring_soon / expired / unknown. */}
      <CertificadoValidadeBanner companySettingsId={companySettingsId} />


      {!canManageCertificates && (
        <Alert data-testid="fiscal-cert-readonly">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Somente leitura</AlertTitle>
          <AlertDescription>
            Você pode visualizar os metadados dos certificados registrados. As
            ações de carregar, registrar do sistema operacional ou revogar
            exigem o papel administrador.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div id="certificado-a1" data-testid="fiscal-cert-card-a1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" aria-hidden /> Certificado A1 (arquivo .pfx/.p12)
              </CardTitle>
              <CardDescription>Upload direto ao cofre seguro do servidor.</CardDescription>
            </CardHeader>
            <CardContent>
              {canManageCertificates ? (
                <UploadCertificadoA1
                  companySettingsId={companySettingsId}
                  onUploaded={() => {
                    void listQ.refetch();
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Upload disponível apenas para administradores.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div data-testid="fiscal-cert-card-os">
          <OsCertificateCard
            companySettingsId={companySettingsId}
            canManage={canManageCertificates}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" aria-hidden /> Certificados registrados
          </CardTitle>
          <CardDescription>Metadados sanitizados. Nenhum dado sensível é exibido.</CardDescription>
        </CardHeader>
        <CardContent>
          {listQ.isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}
          {listQ.isError && (
            <Alert variant="destructive" data-testid="fiscal-cert-list-error">
              <AlertTitle>Cofre indisponível</AlertTitle>
              <AlertDescription>{VAULT_UNAVAILABLE_MESSAGE}</AlertDescription>
            </Alert>
          )}
          {listQ.data && listQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="fiscal-certificados-vazio">
              Nenhum certificado registrado para esta empresa.
            </p>
          )}
          {listQ.data && listQ.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Nome</th>
                    <th className="p-2">Origem</th>
                    <th className="p-2">Ambiente</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Impressão digital</th>
                    <th className="p-2">Validade</th>
                    <th className="p-2">Dias restantes</th>
                    <th className="p-2 sr-only">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.map((c) => {
                    const isHomolog = c.environment === "HOMOLOGATION";
                    return (
                      <tr key={c.certificate_id} className="border-t">
                        <td className="p-2">
                          <div className="font-medium">{c.display_name}</div>
                          {c.subject_name && (
                            <div className="text-xs text-muted-foreground truncate max-w-[280px]">{c.subject_name}</div>
                          )}
                        </td>
                        <td className="p-2 text-xs">{c.source_type === "A1_UPLOAD" ? "A1 (upload)" : "Sistema operacional"}</td>
                        <td className="p-2 text-xs">{environmentLabel(c.environment)}</td>
                        <td className="p-2">{statusBadge(c.status, c.is_active)}</td>
                        <td className="p-2 text-[10px] font-mono" data-testid="fiscal-cert-fp">
                          {maskFingerprint(c.fingerprint_sha256)}
                        </td>
                        <td className="p-2 text-xs">
                          <div>Início: {formatDate(c.valid_from)}</div>
                          <div>Fim: {formatDate(c.valid_until)}</div>
                        </td>
                        <td className="p-2 text-xs tabular-nums">
                          {c.days_until_expiration === null ? "—" : c.days_until_expiration}
                        </td>
                        <td className="p-2 text-right">
                          {canManageCertificates && isHomolog ? (
                            confirmId === c.certificate_id ? (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="destructive" disabled={revoke.isPending} onClick={() => handleRevoke(c.certificate_id)}>
                                  Confirmar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Cancelar</Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => setConfirmId(c.certificate_id)}>
                                Revogar
                              </Button>
                            )
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Card do sistema operacional (bridge nativo)
// ────────────────────────────────────────────────────────────────────────────

interface OsCardProps {
  companySettingsId: string;
  canManage: boolean;
}

function OsCertificateCard({ companySettingsId, canManage }: OsCardProps) {
  const [status, setStatus] = useState<FiscalOsBridgeStatus | null>(null);
  const [certs, setCerts] = useState<FiscalOsCertificateMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("Certificado do sistema operacional");
  const register = useRegisterOsCertificate();

  async function refresh() {
    setLoading(true);
    try {
      const s = await probeOsBridge();
      setStatus(s);
      if (s.available) {
        const list = await listOsCertificatesSafe();
        setCerts(list);
      } else {
        setCerts([]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleRegister(meta: FiscalOsCertificateMetadata) {
    try {
      await register.mutateAsync({
        companySettingsId,
        displayName: displayName || meta.subject_name || "Certificado do sistema operacional",
        metadata: meta,
      });
      toast({ title: "Certificado registrado", description: "Metadados armazenados no cofre lógico." });
    } catch (err) {
      toast({
        title: "Não foi possível registrar",
        description: err instanceof Error ? err.message : "Erro inesperado.",
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Cpu className="h-4 w-4" aria-hidden /> Certificado do sistema operacional
        </CardTitle>
        <CardDescription>
          Detecta certificados instalados no repositório do sistema via conector nativo.
          Somente metadados são exibidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar detecção
          </Button>
          {status && (
            <span className="text-xs text-muted-foreground">
              {status.available ? `Conector v${status.version ?? "?"} disponível` : "Conector indisponível"}
            </span>
          )}
        </div>

        {status && !status.available && (
          <Alert data-testid="fiscal-os-bridge-missing">
            <ShieldOff className="h-4 w-4" aria-hidden />
            <AlertTitle>{OS_BRIDGE_MISSING_MESSAGE}</AlertTitle>
            <AlertDescription className="text-xs">
              Instale o conector nativo ARBio para acessar os certificados do
              repositório do sistema operacional. Nenhuma ação é possível até
              que o conector esteja disponível.
            </AlertDescription>
          </Alert>
        )}

        {status?.available && certs.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            Nenhum certificado disponível no repositório do sistema.
          </p>
        )}

        {status?.available && certs.length > 0 && (
          <div className="space-y-3">
            {canManage && (
              <div className="grid min-w-0 content-start gap-1.5">
                <Label className="text-xs">Nome para exibição</Label>
                <Input
                  value={displayName}
                  maxLength={120}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
            <ul className="space-y-2">
              {certs.map((c) => (
                <li key={c.fingerprint_sha256} className="border rounded p-2 text-sm">
                  <div className="font-medium">{c.subject_name}</div>
                  <div className="text-xs text-muted-foreground">
                    Emissor: {c.issuer_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Serial: <span className="font-mono">{maskSerial(c.serial_number)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Validade: {formatDate(c.valid_from)} → {formatDate(c.valid_until)}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono" data-testid="fiscal-os-cert-fp">
                    Impressão digital: {maskFingerprint(c.fingerprint_sha256)}
                  </div>
                  {canManage && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRegister(c)}
                        disabled={register.isPending}
                      >
                        Registrar no cofre
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
