import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import type { Database } from "@/integrations/supabase/cultivofarm.types";

type Category = Pick<Database["public"]["Tables"]["financial_categories"]["Row"],
  "id" | "name" | "type" | "dre_group" | "active">;

export default function Categorias() {
  const { data = [], isLoading, isError } = useQuery<Category[]>({
    queryKey: ["fin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_categories")
        .select("id, name, type, dre_group, active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Categorias Financeiras</h1>
      </div>

      <p className="text-sm text-muted-foreground">Catálogo compartilhado. A gestão das categorias é feita pela administração da plataforma.</p>

      <Card>
        <CardHeader><CardTitle className="text-base">Lista</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : isError ? (
            <p role="alert" className="text-sm text-destructive">Não foi possível carregar as categorias.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Grupo DRE</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                      <TableCell>
                        {r.dre_group ? (
                          <Badge variant="secondary" className="text-[10px] uppercase">{r.dre_group.replace("_", " ")}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Não definido</span>
                        )}
                      </TableCell>
                      <TableCell>{r.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                    </TableRow>
                  ))}
                  {!data.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma categoria cadastrada</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
