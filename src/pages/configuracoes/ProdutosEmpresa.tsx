import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getAccessLevel } from "@/lib/permissions";
import { useArchiveTenantProduct, useSaveTenantProduct, useTenantProducts } from "@/hooks/useTenantProducts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPOS_PRODUTO, type TenantProduct } from "@/lib/catalogo/tenantProducts";

const brl = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v));

export default function ProdutosEmpresa() {
  const { role } = useAuth();
  const podeEditar = getAccessLevel(role, "/configuracoes/produtos") === "rw";
  const [arquivados, setArquivados] = useState(false);
  const lista = useTenantProducts(arquivados);
  const salvar = useSaveTenantProduct();
  const arquivar = useArchiveTenantProduct();
  const { toast } = useToast();
  const [edit, setEdit] = useState<{ p: TenantProduct | null; nome: string; tipo: string; codigo: string; descricao: string; valor: string } | null>(null);

  const abrir = (p: TenantProduct | null) =>
    setEdit({ p, nome: p?.nome ?? "", tipo: p?.tipo ?? "", codigo: p?.codigo ?? "", descricao: p?.descricao ?? "", valor: p?.valor_ha_brl?.toString() ?? "" });

  const enviar = async () => {
    if (!edit) return;
    try {
      await salvar.mutateAsync({
        id: edit.p?.id ?? null,
        expectedUpdatedAt: edit.p?.updated_at ?? null,
        draft: { nome: edit.nome, ...(edit.tipo ? { tipo: edit.tipo } : {}), codigo: edit.codigo || null, descricao: edit.descricao || null, valor_ha_brl: edit.valor === "" ? null : edit.valor },
      });
      toast({ title: "Produto salvo" });
      setEdit(null);
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Produtos da empresa</CardTitle>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={arquivados} onCheckedChange={setArquivados} aria-label="Mostrar arquivados" />
              Mostrar arquivados
            </label>
            {podeEditar && <Button onClick={() => abrir(null)}>Novo produto</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {lista.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {lista.isError && <p role="alert" className="text-sm text-destructive">{(lista.error as Error).message}</p>}
          {lista.data && lista.data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto cadastrado pela sua empresa.</p>}
          {lista.data && lista.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Nome</TableHead><TableHead>Código</TableHead><TableHead>Valor/ha</TableHead><TableHead>Situação</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {lista.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.nome}</TableCell>
                    <TableCell>{p.codigo ?? "—"}</TableCell>
                    <TableCell>{brl(p.valor_ha_brl)}</TableCell>
                    <TableCell>{p.ativo ? "Ativo" : "Arquivado"}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      {podeEditar && <Button variant="outline" size="sm" onClick={() => abrir(p)}>Editar</Button>}
                      {podeEditar && (
                        <Button variant="ghost" size="sm" disabled={arquivar.isPending}
                          onClick={() => arquivar.mutate({ id: p.id, archived: !!p.ativo, expectedUpdatedAt: p.updated_at },
                            { onError: (e) => toast({ title: "Não foi possível alterar", description: (e as Error).message, variant: "destructive" }) })}>
                          {p.ativo ? "Arquivar" : "Reativar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && !salvar.isPending && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.p ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label htmlFor="tp-nome">Nome</Label><Input id="tp-nome" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></div>
              <div>
                <Label htmlFor="tp-tipo">Tipo</Label>
                <Select value={edit.tipo} onValueChange={(v) => setEdit({ ...edit, tipo: v })}>
                  <SelectTrigger id="tp-tipo"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>{TIPOS_PRODUTO.map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="tp-codigo">Código</Label><Input id="tp-codigo" value={edit.codigo} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} /></div>
              <div><Label htmlFor="tp-desc">Descrição</Label><Input id="tp-desc" value={edit.descricao} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} /></div>
              <div><Label htmlFor="tp-valor">Valor por hectare (R$)</Label><Input id="tp-valor" inputMode="decimal" value={edit.valor} onChange={(e) => setEdit({ ...edit, valor: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={salvar.isPending}>Cancelar</Button>
            <Button onClick={enviar} disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
