import { useAuth } from "@/hooks/useAuth";
import { usePortalCliente } from "@/hooks/usePortalCliente";
import { PortalBrandingSettings } from "@/components/portal/PortalBrandingSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Phone } from "lucide-react";
import { formatTelefone, formatCpfCnpj } from "@/lib/masks";

export default function PortalPerfil() {
  const { profile } = useAuth();
  const { clienteId, clienteNome, loading } = usePortalCliente();
  const p = profile as any;

  if (loading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Meu Perfil</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Dados do Produtor
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suporte</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para suporte técnico ou dúvidas, entre em contato com a equipe Cultivo Farm através do seu consultor técnico responsável.
          </p>
        </CardContent>
      </Card>
      <PortalBrandingSettings scope="cliente" id={clienteId} />
    </div>
  );
}
