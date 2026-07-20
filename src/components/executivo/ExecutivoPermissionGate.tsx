import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert } from "lucide-react";

interface Props {
  children: ReactNode;
}

const ALLOWED = ["administrador", "gestor"];

export function ExecutivoPermissionGate({ children }: Props) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!role || !ALLOWED.includes(role)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3 border rounded-lg p-8 bg-card">
          <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Acesso restrito ao Portal Executivo</h2>
          <p className="text-sm text-muted-foreground">
            Apenas administradores e gestores podem acessar esta área.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
