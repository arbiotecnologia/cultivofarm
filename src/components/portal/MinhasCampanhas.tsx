import { useState } from "react";
import { z } from "zod";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** RPC somente leitura (scripts/user-edit-access-email-links-20261117/campanhas-produtor-minhas-rpc.sql). */
export const MY_CAMPAIGNS_RPC = "producer_my_campaigns_v1";
export const MY_CAMPAIGNS_PAGE = 5;
/** Papéis internos: sessões com qualquer um deles nunca consultam esta seção. */
const INTERNAL_ROLES = new Set(["superadmin", "administrador", "gestor", "administrativo", "financeiro", "gestor_comercial",
  "producao", "aplicador", "operador_onfarm", "consultor_tecnico", "tecnico_agronomo", "vendedor"]);

export function canQueryMyCampaigns(role: string | null, roles: readonly string[]) {
  return role === "cliente_produtor" && roles.includes("cliente_produtor") && !roles.some((r) => INTERNAL_ROLES.has(r));
}

const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pageSchema = z.object({
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(20),
  items: z.array(z.object({ id: z.string().uuid(), nome: z.string(), descricao: z.string().nullable(), data_inicio: civil, data_fim: civil }).strict()),
}).strict();
export const parseMyCampaigns = (d: unknown) => pageSchema.parse(d);
const br = (d: string) => d.split("-").reverse().join("/");

export function MinhasCampanhas({ compact = false }: { compact?: boolean }) {
  const { role, roles } = useAuth();
  const allowed = canQueryMyCampaigns(role, roles as string[]);
  const [offset, setOffset] = useState(0);
  const q = useScopedPortalQuery({
    queryKey: ["portal-minhas-campanhas", offset],
    enabled: allowed,
    queryFn: async (signal) => {
      const { data, error } = await supabase.rpc(MY_CAMPAIGNS_RPC as never, { p_offset: offset, p_limit: MY_CAMPAIGNS_PAGE } as never).abortSignal(signal);
      if (error) throw new Error("load_failed");
      return parseMyCampaigns(data);
    },
    staleTime: 60_000,
  });
  if (!allowed) return null;
  const total = q.data?.total ?? 0;
  return (
    <Card aria-label="Minhas campanhas">
      <CardHeader className={compact ? "p-3 pb-2" : "pb-2 p-4"}>
        <CardTitle className="text-sm sm:text-base flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" />Minhas campanhas</CardTitle>
      </CardHeader>
      <CardContent className={compact ? "p-3 pt-0 space-y-2" : "p-4 pt-0 space-y-2"}>
        {q.isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar suas campanhas. Tente novamente mais tarde.</p>
          : !q.data ? <p role="status" className="text-sm text-muted-foreground animate-pulse">Carregando campanhas…</p>
          : q.data.items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma campanha vigente para você no momento.</p>
          : <ul className="space-y-2">
              {q.data.items.map((c) => (
                <li key={c.id} className="rounded-md border border-border p-3">
                  <p className="font-medium text-foreground break-words">{c.nome}</p>
                  {c.descricao && <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{c.descricao}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Vigência: {br(c.data_inicio)} a {br(c.data_fim)}</p>
                </li>))}
            </ul>}
        {total > MY_CAMPAIGNS_PAGE && q.data && <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - MY_CAMPAIGNS_PAGE))}>Anteriores</Button>
          <span className="text-xs text-muted-foreground">{offset + 1}–{Math.min(offset + MY_CAMPAIGNS_PAGE, total)} de {total}</span>
          <Button type="button" variant="outline" size="sm" disabled={offset + MY_CAMPAIGNS_PAGE >= total} onClick={() => setOffset(offset + MY_CAMPAIGNS_PAGE)}>Próximas</Button>
        </div>}
      </CardContent>
    </Card>
  );
}
