/**
 * Fase Fiscal 3.16.1 — Seção "Certificado Digital" da configuração fiscal.
 *
 * Reúne:
 *   - Upload seguro A1 (Edge Function `fiscal-certificate-upload`)
 *   - Lista de certificados ativos/revogados (via view sanitizada)
 *   - Ação de revogação (Edge Function `fiscal-certificate-revoke`)
 *
 * Somente metadados são carregados no cliente. Nenhum PFX/senha trafega.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
import UploadCertificadoA1 from "./UploadCertificadoA1";
import { useFiscalCertificates, useRevokeFiscalCertificate } from "@/hooks/useFiscalCertificates";
import { toast } from "@/hooks/use-toast";

export interface CertificadoDigitalSecaoProps {
  companySettingsId: string;
  canEdit: boolean;
}

function statusBadge(status: string, isActive: boolean) {
  if (!isActive || status === "REVOKED") return <Badge variant="outline">Revogado</Badge>;
  if (status === "EXPIRED") return <Badge variant="destructive">Expirado</Badge>;
  if (status === "AVAILABLE") return <Badge variant="default">Ativo</Badge>;
  if (status === "ERROR") return <Badge variant="destructive">Erro</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export default function CertificadoDigitalSecao({ companySettingsId, canEdit }: CertificadoDigitalSecaoProps) {
  const listQ = useFiscalCertificates(companySettingsId);
  const revoke = useRevokeFiscalCertificate();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleRevoke(id: string) {
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
      setConfirmId(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="fiscal-certificado-secao">
      <Alert>
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <AlertTitle>Certificado digital A1 — homologação</AlertTitle>
        <AlertDescription className="text-xs">
          Apenas administradores podem carregar ou revogar. O PFX e a senha
          são criptografados no servidor (AES-256-GCM) e jamais persistidos
          no navegador. Nenhum certificado carregado aqui autoriza emissão.
        </AlertDescription>
      </Alert>

      {canEdit ? (
        <UploadCertificadoA1
          companySettingsId={companySettingsId}
          onUploaded={() => listQ.refetch()}
        />
      ) : (
        <Alert variant="destructive">
          <ShieldOff className="h-4 w-4" aria-hidden />
          <AlertTitle>Somente leitura</AlertTitle>
          <AlertDescription>Carregar ou revogar certificados requer papel de administrador.</AlertDescription>
        </Alert>
      )}

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
            <Alert variant="destructive">
              <AlertTitle>Falha ao carregar certificados</AlertTitle>
              <AlertDescription>{(listQ.error as Error)?.message ?? "Erro inesperado."}</AlertDescription>
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
                    <th className="p-2">Validade</th>
                    <th className="p-2">Dias restantes</th>
                    <th className="p-2 sr-only">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.map((c) => (
                    <tr key={c.certificate_id} className="border-t">
                      <td className="p-2">
                        <div className="font-medium">{c.display_name}</div>
                        {c.subject_name && (
                          <div className="text-xs text-muted-foreground truncate max-w-[280px]">{c.subject_name}</div>
                        )}
                      </td>
                      <td className="p-2 text-xs">{c.source_type === "A1_UPLOAD" ? "A1 (upload)" : "Sistema operacional"}</td>
                      <td className="p-2 text-xs">{c.environment === "HOMOLOGATION" ? "Homologação" : "Produção"}</td>
                      <td className="p-2">{statusBadge(c.status, c.is_active)}</td>
                      <td className="p-2 text-xs">
                        <div>Início: {formatDate(c.valid_from)}</div>
                        <div>Fim: {formatDate(c.valid_until)}</div>
                      </td>
                      <td className="p-2 text-xs tabular-nums">
                        {c.days_until_expiration === null ? "—" : c.days_until_expiration}
                      </td>
                      <td className="p-2 text-right">
                        {canEdit && c.is_active && c.status === "AVAILABLE" ? (
                          confirmId === c.certificate_id ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="destructive" disabled={revoke.isPending} onClick={() => handleRevoke(c.certificate_id)}>
                                Confirmar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Cancelar</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setConfirmId(c.certificate_id)}>
                              Revogar
                            </Button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
