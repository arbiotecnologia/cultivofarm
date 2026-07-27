import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Search, ShieldAlert } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";

type Origem = "comunicacao" | "provider_settings";

interface UnifiedRow {
  key: string;
  created_at: string;
  origem: Origem;
  acao: string;
  provider: string; // entidade (comunicacao) OR "provider_settings"
  entity_id: string | null;
  actor_id: string | null;
  detail: string;
}

const ORIGEM_LABEL: Record<Origem, string> = {
  comunicacao: "Comunicação",
  provider_settings: "Config. Provedores",
};

export default function ComunicacaoTab() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [acaoFilter, setAcaoFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [comRes, provRes] = await Promise.all([
          supabase
            .from("comunicacao_audit_log")
            .select("id, created_at, acao, entidade, entity_id, actor_id")
            .order("created_at", { ascending: false })
            .limit(500),
          supabase
            .from("communication_provider_settings_audit")
            .select("id, created_at, action, changed_fields, secret_field, actor_id")
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        if (comRes.error) throw comRes.error;
        if (provRes.error) throw provRes.error;

        const unified: UnifiedRow[] = [
          ...(comRes.data ?? []).map((r) => ({
            key: `c-${r.id}`,
            created_at: r.created_at,
            origem: "comunicacao" as Origem,
            acao: r.acao,
            provider: r.entidade,
            entity_id: r.entity_id,
            actor_id: r.actor_id,
            detail: r.entity_id ? `entity_id: ${r.entity_id}` : "—",
          })),
          ...(provRes.data ?? []).map((r) => ({
            key: `p-${r.id}`,
            created_at: r.created_at,
            origem: "provider_settings" as Origem,
            acao: r.action,
            provider: "provider_settings",
            entity_id: null,
            actor_id: r.actor_id,
            detail: [
              (r.changed_fields ?? []).length
                ? `campos: ${(r.changed_fields ?? []).join(", ")}`
                : null,
              r.secret_field ? `segredo: ${r.secret_field} (nome apenas)` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—",
          })),
        ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

        if (!cancelled) setRows(unified);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Falha ao carregar auditoria.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.provider))).sort(),
    [rows],
  );
  const acoes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.acao))).sort(),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (origemFilter !== "all" && r.origem !== origemFilter) return false;
    if (providerFilter !== "all" && r.provider !== providerFilter) return false;
    if (acaoFilter !== "all" && r.acao !== acaoFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !r.acao.toLowerCase().includes(s) &&
        !r.provider.toLowerCase().includes(s) &&
        !(r.entity_id ?? "").toLowerCase().includes(s) &&
        !(r.actor_id ?? "").toLowerCase().includes(s) &&
        !r.detail.toLowerCase().includes(s)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> Auditoria de Comunicação
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Trilha unificada de eventos do módulo de comunicação e alterações de
          configuração de provedores. Segredos nunca são exibidos — apenas o nome
          do campo alterado é registrado.
        </p>

        <div className="grid gap-2 mt-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ação, provider, ator ou entity_id..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={origemFilter} onValueChange={setOrigemFilter}>
            <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="comunicacao">{ORIGEM_LABEL.comunicacao}</SelectItem>
              <SelectItem value="provider_settings">{ORIGEM_LABEL.provider_settings}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={acaoFilter} onValueChange={setAcaoFilter}>
            <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              {acoes.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="md:col-span-1"><SelectValue placeholder="Provider / Entidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive mb-3">
            <ShieldAlert className="h-4 w-4" /> {error}
          </div>
        )}
        <div className="text-xs text-muted-foreground mb-2">
          {loading ? "Carregando..." : `${filtered.length} de ${rows.length} registros (limite de 500 por origem)`}
        </div>
        <div className="border rounded-md overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Provider / Entidade</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>Ator</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTimeDisplay(r.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={r.origem === "provider_settings" ? "secondary" : "outline"}>
                      {ORIGEM_LABEL[r.origem]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{r.provider}</TableCell>
                  <TableCell className="text-sm">{r.acao}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[360px] truncate" title={r.detail}>
                    {r.detail}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {r.actor_id ? r.actor_id.slice(0, 8) + "…" : "sistema"}
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
