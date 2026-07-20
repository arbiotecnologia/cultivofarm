import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { History, Search } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { Input } from "@/components/ui/input";

interface AuditLog {
  id: string;
  created_at: string;
  executor: { nome: string; email: string } | null;
  target: { nome: string; email: string } | null;
}

export function AuditSenhaDialog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("audit_senha_log")
        .select(`
          id,
          created_at,
          executor:executor_id(nome, email),
          target:target_user_id(nome, email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      // @ts-ignore - Supabase type for joined tables can be tricky
      setLogs(data || []);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const search = searchTerm.toLowerCase();
    return (
      log.executor?.nome?.toLowerCase().includes(search) ||
      log.executor?.email?.toLowerCase().includes(search) ||
      log.target?.nome?.toLowerCase().includes(search) ||
      log.target?.email?.toLowerCase().includes(search)
    );
  });

  return (
    <Dialog onOpenChange={(open) => open && fetchLogs()}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <History className="h-4 w-4 mr-2" />
          Auditoria de Senhas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Alterações de Senhas
          </DialogTitle>
        </DialogHeader>
        
        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por executor ou usuário alvo..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Executor (Admin)</TableHead>
                <TableHead>Usuário Afetado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTimeDisplay(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{log.executor?.nome || "Sistema"}</span>
                        <span className="text-xs text-muted-foreground">{log.executor?.email || ""}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{log.target?.nome || "N/A"}</span>
                        <span className="text-xs text-muted-foreground">{log.target?.email || ""}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
