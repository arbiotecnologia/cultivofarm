import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDown, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

interface ReportShellProps<TData = unknown> {
  title: string;
  description?: string;
  reportType: string;
  defaultFilters?: Record<string, unknown>;
  /** Renders custom filter fields; receives current state and setter */
  renderFilters?: (filters: Record<string, unknown>, set: (f: Record<string, unknown>) => void) => React.ReactNode;
  renderPreview?: (data: TData) => React.ReactNode;
  /** When true, asks for "customer_id" filter required (CUSTOMER_STATEMENT, ACCOUNTABILITY) */
  requiresCustomer?: boolean;
}

export function ReportShell<TData = unknown>(props: ReportShellProps<TData>) {
  const access = useStorageAccessScope(`report:${props.reportType}`);
  const { error } = useAuth();
  return <ScopedReportShell<TData> key={JSON.stringify([access.scope, !!error])} {...props} />;
}

function ScopedReportShell<TData = unknown>({
  title,
  description,
  reportType,
  defaultFilters = {},
  renderFilters,
  renderPreview,
  requiresCustomer,
}: ReportShellProps<TData>) {
  const { user, error: authError } = useAuth();
  const access = useStorageAccessScope(`report:${reportType}`);
  const ready = access.ready && !authError;
  const [filters, setFilters] = useState<Record<string, unknown>>(() => structuredClone(defaultFilters));
  const [data, setData] = useState<TData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, unknown> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const operation = useRef<symbol | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const validate = () => {
    const f = filters as Record<string, unknown>;
    const from = (f.from ?? f._from ?? f.start_date) as string | undefined;
    const to = (f.to ?? f._to ?? f.end_date) as string | undefined;
    if (!from || !to) {
      toast.error("Informe data inicial e final");
      return false;
    }
    if (new Date(to) < new Date(from)) {
      toast.error("Data final não pode ser menor que a inicial");
      return false;
    }
    if (requiresCustomer && !(f.customer_id || f._customer_id)) {
      toast.error("Cliente é obrigatório para este relatório");
      return false;
    }
    return true;
  };

  const generate = async () => {
    if (!ready || operation.current || !validate()) return;
    const current = access.capture();
    const request = Symbol();
    operation.current = request;
    const snapshot = structuredClone(filters);
    const isCurrent = () => current() && operation.current === request;
    setData(null);
    setGeneratedAt(null);
    setAppliedFilters(null);
    setPreviewError(null);
    setLoading(true);
    try {
      const rpcMap: Record<string, string> = {
        monthly: "get_report_monthly_financial",
        receivables: "get_report_receivables",
        payables: "get_report_payables",
        delinquency: "get_report_delinquency",
        nfe_pending: "get_report_nfe_pending",
        deliveries_billing: "get_report_deliveries_billing_status",
        customer_statement: "get_report_customer_statement",
        accountability: "get_report_accountability",
      };
      const fn = rpcMap[reportType];
      if (!fn) throw new Error("Tipo de relatório indisponível");
      const rpc = supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data: result, error } = await rpc(fn, snapshot);
      if (!isCurrent()) return;
      if (error) throw error;
      setData(result as TData);
      setGeneratedAt(new Date());
      setAppliedFilters(snapshot);
      const rows = Array.isArray(result) ? result.length : 0;
      if (rows > 1000) {
        toast.warning(`Prévia com ${rows} linhas. Recomendamos exportar em Excel ou CSV.`);
      }
    } catch {
      if (!isCurrent()) return;
      const message = "Não foi possível gerar a prévia. Verifique seu acesso e tente novamente.";
      setPreviewError(message);
      toast.error(message);
    } finally {
      if (isCurrent()) { operation.current = null; setLoading(false); }
    }
  };

  const exportFormat = async (format: "PDF" | "XLSX" | "CSV") => {
    if (!ready || operation.current || !validate()) return;
    const current = access.capture();
    const request = Symbol();
    operation.current = request;
    const isCurrent = () => current() && operation.current === request;
    const snapshot = structuredClone(filters);
    setExporting(format);
    try {
      const { data: res, error } = await supabase.functions.invoke("generate-financial-report", {
        body: { report_type: reportType, filters: snapshot, format, title },
      });
      if (!isCurrent()) return;
      if (error) throw error;
      const url = (res as { url?: string } | null | undefined)?.url;
      if (!url) throw new Error("Exportação indisponível");
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success(`${format} gerado`);
      }
    } catch (e: unknown) {
      if (!isCurrent()) return;
      toast.error(e instanceof Error ? e.message : "Erro ao exportar");
    } finally {
      if (isCurrent()) { operation.current = null; setExporting(null); }
    }
  };

  const empty = data == null || (Array.isArray(data) && data.length === 0);
  const busy = loading || exporting !== null;
  const print = () => {
    if (!ready || operation.current) return;
    const current = access.capture();
    if (empty) {
      toast.error("Gere a prévia antes de imprimir");
      return;
    }
    if (current()) window.print();
  };

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Cabeçalho institucional (visível na tela e na impressão) */}
      <header className="rounded-lg border bg-card p-4 print:border-b print:border-x-0 print:border-t-0 print:rounded-none">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cultivo Farm</p>
            <h1 className="text-2xl font-bold leading-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Tipo: <span className="font-mono">{reportType}</span></p>
            {generatedAt && <p>Gerado em: {formatDateTimeDisplay(generatedAt)}</p>}
            {user && <p>Usuário: {user.email ?? user.id.substring(0, 8)}</p>}
          </div>
        </div>
        {appliedFilters && Object.keys(appliedFilters).length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground break-words">
            Filtros aplicados: <span className="font-mono">{JSON.stringify(appliedFilters)}</span>
          </p>
        )}
      </header>

      <Card className="print:hidden">
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {renderFilters ? renderFilters(filters, setFilters) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>De *</Label><Input type="date" value={(filters.from as string) ?? ""} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
              <div><Label>Até *</Label><Input type="date" value={(filters.to as string) ?? ""} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={generate} disabled={!ready || busy}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Gerar prévia</Button>
            <Button variant="outline" onClick={() => exportFormat("PDF")} disabled={!ready || busy}><FileText className="w-4 h-4 mr-2" />PDF</Button>
            <Button variant="outline" onClick={() => exportFormat("XLSX")} disabled={!ready || busy}><FileSpreadsheet className="w-4 h-4 mr-2" />Excel</Button>
            <Button variant="outline" onClick={() => exportFormat("CSV")} disabled={!ready || busy}><FileDown className="w-4 h-4 mr-2" />CSV</Button>
            <Button variant="outline" onClick={print} disabled={!ready || busy || empty}><Printer className="w-4 h-4 mr-2" />Imprimir</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="print:hidden"><CardTitle className="text-base">Prévia</CardTitle></CardHeader>
        <CardContent>
          {!ready ? (
            <p role="status" className="text-sm text-muted-foreground">Sessão indisponível para relatórios.</p>
          ) : loading ? (
            <p role="status" className="text-sm text-muted-foreground">Gerando prévia…</p>
          ) : previewError ? (
            <p role="alert" className="text-sm text-destructive">{previewError}</p>
          ) : appliedFilters && empty ? (
            <p role="status" className="text-sm text-muted-foreground">Nenhum registro no período selecionado.</p>
          ) : data == null ? (
            <p className="text-sm text-muted-foreground">Gere a prévia para visualizar os dados.</p>
          ) : renderPreview ? renderPreview(data as TData) : (
            <pre className="text-xs overflow-auto max-h-[60vh] bg-muted p-3 rounded">{JSON.stringify(data, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      <footer className="hidden print:block text-xs text-muted-foreground border-t pt-2 mt-4">
        Cultivo Farm • Relatório gerado eletronicamente • {formatDateTimeDisplay(new Date())}
      </footer>
    </div>
  );
}
