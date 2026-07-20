import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertasSLAConfigTable } from "./AlertasSLAConfigTable";
import { useAuth } from "@/hooks/useAuth";

const ROLES_VER_CONFIG = ["administrador", "gestor", "administrativo"];

export function AlertasSLAConfig() {
  const { role } = useAuth();
  if (!role || !ROLES_VER_CONFIG.includes(role)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configurações de SLA</CardTitle>
        <p className="text-xs text-muted-foreground">
          Prazos por gravidade, tipo de alerta e origem. Edição administrativa apenas para administrador/gestor; nesta fase, ajustes específicos podem ser feitos diretamente no banco por administradores.
        </p>
      </CardHeader>
      <CardContent>
        <AlertasSLAConfigTable />
      </CardContent>
    </Card>
  );
}
