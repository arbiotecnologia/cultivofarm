import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

interface ExportRow {
  id: string;
  report_type: string;
  report_title: string | null;
  file_format: string | null;
  format: string;
  filters: any;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
  generated_by: string;
  generated_at: string;
  row_count: number | null;
}

export function HistoricoExportacoes() {
  const access = useStorageAccessScope("financial-export-history");
  const [result, setResult] = useState<{ scope: string; rows: ExportRow[] }>({ scope: "", rows: [] });
  const rows = access.ready && result.scope === access.scope ? result.rows : [];
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [format, setFormat] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    if (!access.ready) return;
    const current = access.capture();
    setLoading(true);
    let q = supabase.from("financial_report_exports" as any)
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(500);
    if (type) q = q.eq("report_type", type);
    if (format) q = q.eq("file_format", format);
    if (from) q = q.gte("generated_at", from);
    if (to) q = q.lte("generated_at", to + "T23:59:59");
    const { data, error } = await q;
    if (!current()) return;
    if (error) toast.error(error.message);
    setResult({ scope: access.scope, rows: (data as unknown as ExportRow[]) ?? [] });
    setLoading(false);
  };

  useEffect(() => {
    setResult({ scope: access.scope, rows: [] });
    setLoading(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, format, from, to, access.scope]);

  const download = async (r: ExportRow) => {
    if (!access.ready) return;
    const current = access.capture();
    if (!r.storage_path) {
      toast.error("Arquivo não disponível");
      return;
    }
    const { data, error } = await supabase.storage
      .from(r.storage_bucket ?? "financial-reports")
      .createSignedUrl(r.storage_path, 3600);
    if (!current()) return;
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Falha ao gerar URL");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Tipo</Label><Input value={type} onChange={(e) => setType(e.target.value)} placeholder="monthly, receivables…" /></div>
          <div><Label>Formato</Label>
            <select className="w-full border rounded h-9 px-2 bg-background" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="">Todos</option><option>PDF</option><option>XLSX</option><option>CSV</option>
            </select>
          </div>
          <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Relatório</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead>Linhas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Gerado em</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.report_title ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.report_type}</TableCell>
                    <TableCell><Badge variant="outline">{r.file_format ?? r.format}</Badge></TableCell>
                    <TableCell>{r.row_count ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={["SUCCESS"].includes(r.status) ? "default" : "destructive"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatDateTimeDisplay(r.generated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={!r.storage_path} onClick={() => download(r)}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma exportação</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
