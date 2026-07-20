import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";

export default function ClientesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["auditoria-clientes"],
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from("clientes_audit_log")
        .select("id, action, changed_at, changed_by, cliente_id, diff")
        .order("changed_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      const userIds = [...new Set((logs || []).map((l: any) => l.changed_by).filter(Boolean))];
      const clienteIds = [...new Set((logs || []).map((l: any) => l.cliente_id).filter(Boolean))];

      const [profilesRes, clientesRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, nome, email").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        clienteIds.length
          ? supabase.from("clientes").select("id, nome").in("id", clienteIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const clientesMap = new Map((clientesRes.data || []).map((c: any) => [c.id, c]));

      return (logs || []).map((l: any) => ({
        ...l,
        autor: profilesMap.get(l.changed_by) || null,
        cliente: clientesMap.get(l.cliente_id) || null,
      }));
    },
  });

  const actionBadge = (action: string) => {
    if (action === "INSERT") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Criado</Badge>;
    if (action === "DELETE") return <Badge variant="destructive">Excluído</Badge>;
    return <Badge variant="secondary">Atualizado</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Alterações em Clientes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Campos alterados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : !data?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma alteração registrada.</TableCell></TableRow>
              ) : data.map((l: any) => {
                const campos = l.diff ? Object.keys(l.diff).filter(k => !["updated_at","created_at"].includes(k)) : [];
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {l.changed_at ? formatDateTimeDisplay(l.changed_at) : "—"}
                    </TableCell>
                    <TableCell>{actionBadge(l.action)}</TableCell>
                    <TableCell className="text-sm font-medium">{l.cliente?.nome || l.cliente_id?.slice(0,8) || "—"}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium">{l.autor?.nome || "Sistema"}</span>
                        <span className="text-muted-foreground">{l.autor?.email || ""}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md">
                      {campos.length ? (
                        <div className="flex flex-wrap gap-1">
                          {campos.slice(0, 6).map(c => (
                            <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                          ))}
                          {campos.length > 6 && <span className="text-[10px]">+{campos.length - 6}</span>}
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
