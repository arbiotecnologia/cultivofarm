import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Phone, Sprout, Store } from "lucide-react";
import { formatTelefone, formatCpfCnpj } from "@/lib/masks";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { getActivePortalContext } from "@/lib/activePortalContext";
import { Badge } from "@/components/ui/badge";

export default function PortalPerfil() {
  const { profile } = useAuth();
  const { clienteNome, loading } = usePortalCliente();
  const { data: contexts } = useAvailableContexts();
  const p = profile as any;

  const activeCtx = getActivePortalContext();
  const portalLabel =
    activeCtx === "b2b"
      ? "Parceiro B2B"
      : activeCtx === "technical"
        ? "Consultor Técnico"
        : activeCtx === "producer"
          ? "Produtor"
          : "Portal Técnico";
  const PortalIcon = activeCtx === "b2b" ? Store : Sprout;

  const others: string[] = [];
  if (contexts?.has_b2b_access && activeCtx !== "b2b") others.push("Portal Parceiro B2B");
  if (contexts?.has_technical_access && activeCtx !== "technical") others.push("Portal Técnico");

  if (loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Meu Perfil</h1>
        <Badge variant="secondary" className="gap-1">
          <PortalIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {portalLabel}
        </Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Dados do Usuário
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-medium">{p?.nome || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cliente</p>
              <p className="font-medium">{clienteNome || "-"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">E-mail</p>
                <p className="font-medium">{p?.email || "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium">{formatTelefone(p?.telefone) || "-"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CPF/CNPJ</p>
              <p className="font-medium">{formatCpfCnpj(p?.cpf_cnpj) || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outros acessos disponíveis</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1">
              {others.map((o) => (
                <li key={o}>• {o}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-3">
              Use "Trocar de portal" no menu para alternar sem sair da conta.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suporte</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para suporte técnico ou dúvidas, entre em contato com a equipe A.R Bio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
