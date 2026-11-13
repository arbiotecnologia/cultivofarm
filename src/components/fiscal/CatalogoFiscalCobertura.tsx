/**
 * Cobertura fiscal do catálogo (SOMENTE LEITURA): produtos por família (com e
 * sem perfil), microrganismos, clientes e serviços. Contagens via `head:true`
 * sob RLS do usuário; nada é criado ou alterado. Cada linha leva ao MESMO
 * editor fiscal canônico.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = supabase.from.bind(supabase) as unknown as (t: string) => any;

async function count(q: Promise<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: c, error } = await q;
  if (error) throw new Error("read_failed");
  return c ?? 0;
}

export interface CoverageRow { key: string; label: string; total: number; withProfile: number; link: string }

export const FAMILY_ROWS = [
  { value: "biologico", label: "Produtos biológicos" },
  { value: "quimico", label: "Produtos químicos" },
  { value: "fertilizante_adubo", label: "Fertilizantes/Adubos" },
] as const;

export function useCatalogoFiscalCobertura(enabled = true) {
  return useQuery({
    queryKey: ["fiscal", "catalog-coverage"],
    enabled,
    retry: false,
    queryFn: async (): Promise<CoverageRow[]> => {
      const prodTotal = (fam: string | null) => {
        let q = anyFrom("produtos").select("id", { count: "exact", head: true }).eq("ativo", true);
        q = fam === null ? q.is("familia_catalogo", null) : q.eq("familia_catalogo", fam);
        return count(q);
      };
      const prodWith = (fam: string | null) => {
        let q = anyFrom("produtos").select("id, product_fiscal_profiles!inner(id)", { count: "exact", head: true })
          .eq("ativo", true).eq("product_fiscal_profiles.is_active", true);
        q = fam === null ? q.is("familia_catalogo", null) : q.eq("familia_catalogo", fam);
        return count(q);
      };
      const fams: (string | null)[] = [...FAMILY_ROWS.map((f) => f.value), null];
      const prodRows = await Promise.all(fams.map(async (f) => {
        const [total, withProfile] = await Promise.all([prodTotal(f), prodWith(f)]);
        const label = f === null ? "Produtos sem classificação" : FAMILY_ROWS.find((r) => r.value === f)!.label;
        return { key: `fam:${f ?? "none"}`, label, total, withProfile, link: "/configuracoes/fiscal/produtos" };
      }));
      const [microTotal, microWith, cliTotal, cliWith, svc] = await Promise.all([
        count(anyFrom("microrganismos").select("id", { count: "exact", head: true })),
        count(anyFrom("microorganism_fiscal_profiles").select("id", { count: "exact", head: true }).eq("is_active", true)),
        count(anyFrom("clientes").select("id", { count: "exact", head: true })),
        count(anyFrom("customer_fiscal_profiles").select("id", { count: "exact", head: true })),
        count(anyFrom("service_fiscal_profiles").select("id", { count: "exact", head: true }).eq("is_active", true)),
      ]);
      return [
        ...prodRows,
        { key: "micro", label: "Microrganismos", total: microTotal, withProfile: microWith, link: "/configuracoes/fiscal/produtos" },
        { key: "clientes", label: "Clientes", total: cliTotal, withProfile: cliWith, link: "/configuracoes/fiscal/clientes" },
        { key: "servicos", label: "Serviços cadastrados", total: svc, withProfile: svc, link: "/configuracoes/fiscal/servicos" },
      ];
    },
  });
}

export function CatalogoFiscalCobertura() {
  const q = useCatalogoFiscalCobertura();
  return (
    <Card data-testid="fiscal-catalog-coverage">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Catálogo fiscal</CardTitle>
        <CardDescription>Itens cadastrados e quantos já têm perfil fiscal. Visualizar não cria perfil.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando" /> : q.isError ? (
          <Alert variant="destructive"><AlertDescription>Não foi possível ler o catálogo fiscal.</AlertDescription></Alert>
        ) : (
          <ul className="divide-y">
            {(q.data ?? []).map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{r.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.withProfile} com perfil · {Math.max(r.total - r.withProfile, 0)} sem perfil
                </span>
                <Button asChild variant="link" size="sm" className="min-h-11 px-0"><Link to={r.link}>Abrir</Link></Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
