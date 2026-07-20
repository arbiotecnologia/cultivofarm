import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";

export default function AgendaTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["auditoria-agenda"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agenda_sync_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" /> Sincronização de Agenda
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Evento externo</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : !data?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma sincronização registrada.</TableCell></TableRow>
              ) : data.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTimeDisplay(l.last_synced_at || l.created_at)}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{l.provider}</Badge></TableCell>
                  <TableCell>
                    {l.status === "synced" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />synced</Badge>
                    ) : (
                      <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{l.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono truncate max-w-[200px]">{l.external_event_id || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">{l.error_message || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
