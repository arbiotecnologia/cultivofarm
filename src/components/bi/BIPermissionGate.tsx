import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { BISection, canAccessBISection } from "@/lib/biPermissions";
import { AlertCircle } from "lucide-react";

interface BIPermissionGateProps {
  section: BISection;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function BIPermissionGate({ section, children, fallback }: BIPermissionGateProps) {
  const { role } = useAuth();
  const hasAccess = canAccessBISection(role, section);

  if (!hasAccess) {
    return (
      fallback || (
        <div className="p-12 text-center flex flex-col items-center justify-center bg-muted/20 rounded-xl border border-dashed">
          <AlertCircle className="h-8 w-8 text-muted-foreground mb-4" />
          <h3 className="text-lg font-bold text-foreground">Acesso Restrito</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Você não possui permissão para visualizar esta seção do BI.
          </p>
        </div>
      )
    );
  }

  return <>{children}</>;
}
