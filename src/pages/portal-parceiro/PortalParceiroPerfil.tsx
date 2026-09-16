import { useAuth } from "@/hooks/useAuth";
import { useMyPartner } from "@/hooks/useMyPartner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail } from "lucide-react";
import { PortalBrandingSettings } from "@/components/portal/PortalBrandingSettings";

export default function PortalParceiroPerfil() {
  const { profile, role } = useAuth();
  const { data: partner, isLoading } = useMyPartner();
  const p = profile as any;

  const isStaff = role === "administrador" || role === "gestor_comercial";
  const isGestor = partner?.papel === "gestor";
  const podeEditar = !!partner?.id && isGestor && !isStaff;

  if (isLoading) return <div className="animate-pulse text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Perfil e identidade</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Dados do parceiro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-medium">{p?.nome || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Parceiro</p>
              <p className="font-medium">
                {(partner as any)?.nome_fantasia || (partner as any)?.razao_social || "-"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">E-mail</p>
                <p className="font-medium">{p?.email || "-"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PortalBrandingSettings
        scope="parceiro"
        id={(partner as any)?.id ?? null}
        disabled={!podeEditar}
        disabledReason={
          isStaff
            ? "Visão interna: a identidade visual é definida pelo gestor do parceiro."
            : "Apenas o gestor do parceiro pode alterar a identidade visual."
        }
      />
    </div>
  );
}
