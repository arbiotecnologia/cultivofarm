import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";

export default function VisitasTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["auditoria-visitas"],
    queryFn: async () => {
      const [logsRes, statusRes] = await Promise.all([
        supabase
          .from("visitas_logs" as any)
          .select("id, acao, descricao, usuario_id, created_at, registro_consultor_id, solicitacao_id")
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("registros_consultor_status_log" as any)
          .select("id, status_anterior, status_novo, changed_by, created_at, registro_consultor_id")
          .order("created_at", { ascending: false })
          .limit(150),
      ]);

      const visitas = (logsRes.data as any[] || []).map((v) => ({
        id: `v-${v.id}`,
        tipo: "ação",
        when: v.created_at,
        user_id: v.usuario_id,
        descricao: v.descricao || v.acao,
        meta: v.acao,
      }));

      const status = (statusRes.data as any[] || []).map((s) => ({
        id: `s-${s.id}`,
        tipo: "transição",
        when: s.created_at,
        user_id: s.changed_by,
        descricao: `${s.status_anterior || "—"} → ${s.status_novo}`,
        meta: "registro_consultor",
      }));

      const combined = [...visitas, ...status].sort((a, b) =>
        new Date(b.when).getTime() - new Date(a.when).getTime()
      );

      const userIds = [...new Set(combined.map((c) => c.user_id).filter(Boolean))];
      const profilesRes = userIds.length
        ? await supabase.from("profiles").select("user_id, nome, email").in("user_id", userIds)
        : { data: [] as any[] };
      const map = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));

      return combined.map((c) => ({ ...c, autor: map.get(c.user_id) || null }));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" /> Visitas e Transições de Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Autor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : !data?.length ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum evento registrado.</TableCell></TableRow>
              ) : data.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {l.when ? formatDateTimeDisplay(l.when) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">{l.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{l.descricao}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col">
                      <span className="font-medium">{l.autor?.nome || "Sistema"}</span>
                      <span className="text-muted-foreground">{l.autor?.email || ""}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
