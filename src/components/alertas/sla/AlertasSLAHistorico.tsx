import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeDisplay } from "@/lib/date-utils";

interface EventoRow {
  id: string;
  alerta_id: string;
  evento: string;
  gravidade_anterior: string | null;
  gravidade_nova: string | null;
  created_at: string;
}

export function AlertasSLAHistorico() {
  const [rows, setRows] = useState<EventoRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("alertas_sla_eventos" as any)
        .select("id,alerta_id,evento,gravidade_anterior,gravidade_nova,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setRows((data as any) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando histórico...</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nenhum evento de SLA registrado.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          <TableHead>Evento</TableHead>
          <TableHead>Alerta</TableHead>
          <TableHead>Mudança</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="text-xs">{formatDateTimeDisplay(r.created_at)}</TableCell>
            <TableCell><Badge variant="outline">{r.evento}</Badge></TableCell>
            <TableCell className="font-mono text-xs">{r.alerta_id.slice(0, 8)}</TableCell>
            <TableCell className="text-xs">
              {r.gravidade_anterior && r.gravidade_nova ? `${r.gravidade_anterior} → ${r.gravidade_nova}` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
