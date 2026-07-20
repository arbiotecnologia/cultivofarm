import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, History } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";

interface AuditLog {
  id: string;
  created_at: string;
  executor: { nome: string; email: string } | null;
  target: { nome: string; email: string } | null;
}

export default function SenhasTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("audit_senha_log")
          .select(`id, created_at, executor:executor_id(nome, email), target:target_user_id(nome, email)`)
          .order("created_at", { ascending: false });
        if (error) throw error;
        // @ts-ignore
        setLogs(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = logs.filter((log) => {
    const s = search.toLowerCase();
    if (!s) return true;
    return (
      log.executor?.nome?.toLowerCase().includes(s) ||
      log.executor?.email?.toLowerCase().includes(s) ||
      log.target?.nome?.toLowerCase().includes(s) ||
      log.target?.email?.toLowerCase().includes(s)
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Alterações de Senhas
        </CardTitle>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por executor ou usuário alvo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Executor (Admin)</TableHead>
                <TableHead>Usuário Afetado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>
              ) : filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs">
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
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
