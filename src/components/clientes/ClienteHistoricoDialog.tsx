import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeDisplay } from "@/lib/date-utils";

interface ClienteHistoricoDialogProps {
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClienteHistoricoDialog({ clienteId, open, onOpenChange }: ClienteHistoricoDialogProps) {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (open && clienteId) {
      supabase
        .from("clientes_audit_log")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("changed_at", { ascending: false })
        .then(({ data }) => setLogs(data || []));
    }
  }, [open, clienteId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Alterações</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Alterações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sem histórico</TableCell></TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTimeDisplay(log.changed_at) || "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      log.action === 'INSERT' ? 'bg-green-100 text-green-700' : 
                      log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' : 
                      'bg-red-100 text-red-700'
                    }`}>
                      {log.action === 'INSERT' ? 'Criação' : log.action === 'UPDATE' ? 'Edição' : 'Exclusão'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-1">
                      {log.diff && Object.entries(log.diff).map(([key, val]: [string, any]) => (
                        <div key={key}>
                          <span className="font-semibold">{key}:</span> {JSON.stringify(log.old_data?.[key])} → <span className="text-primary">{JSON.stringify(val)}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
