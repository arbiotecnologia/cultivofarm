import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";

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
                      <ExportDownload row={r} listScope={access.scope} />
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

const EXPORT_BUCKET = "financial-reports";

/**
 * Explicit two-step download via the canonical authenticated opener
 * (Storage RLS financial_storage_object_permitted). No signed/public URLs;
 * other buckets fail closed. The row snapshot is part of the scope.
 */
function ExportDownload({ row, listScope }: { row: ExportRow; listScope: string }) {
  const snapshot = { id: row.id, storage_bucket: row.storage_bucket ?? null, storage_path: row.storage_path ?? null, status: row.status };
  const resource = JSON.stringify(["financial-export", listScope, snapshot]);
  const access = useStorageAccessScope(resource);
  const opener = useAuthenticatedAttachmentOpener(resource, EXPORT_BUCKET);
  const [busy, setBusy] = useState(false);
  const pending = useRef<(() => boolean) | null>(null);
  useLayoutEffect(() => {
    setBusy(false);
    return () => { pending.current = null; };
  }, [access.scope]);
  const path = snapshot.storage_path;
  const eligible = typeof path === "string" && path.length > 0 && (snapshot.storage_bucket ?? EXPORT_BUCKET) === EXPORT_BUCKET;
  const prepared = eligible && !!path && !!opener.urls[path];
  const loading = eligible && !!path && opener.loadingPaths.includes(path);
  const ext = (row.file_format ?? row.format ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const fileName = `${(row.report_type || "relatorio").replace(/[^a-zA-Z0-9_-]/g, "_")}${ext ? `.${ext}` : ""}`;
  const onClick = async () => {
    const current = access.capture();
    if (!current() || !eligible || !path || pending.current) return;
    if (opener.urls[path]) { opener.download(path, fileName); return; }
    pending.current = current;
    setBusy(true);
    try {
      await opener.open(path, () => { if (current() && pending.current === current) toast.error("Arquivo indisponível"); });
    } finally {
      if (pending.current === current) {
        pending.current = null;
        if (current()) setBusy(false);
      }
    }
  };
  const label = prepared ? "Baixar exportação" : "Preparar exportação";
  return (
    <Button size="sm" variant="outline" disabled={!access.ready || !eligible || busy || loading} onClick={onClick} aria-label={label} title={label}>
      {busy || loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
    </Button>
  );
}
