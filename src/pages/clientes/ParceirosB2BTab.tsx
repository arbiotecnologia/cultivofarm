import { useMemo, useState } from "react";
import { Handshake, Plus, Search, Pencil, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useParceirosB2B,
  type ParceiroB2B,
  type StatusFiltroParceiro,
  type FaixaDescontoFiltro,
  type VinculoClienteFiltro,
} from "@/hooks/useParceirosB2B";
import { useSoftDeleteParceiroB2B } from "@/hooks/useParceiroB2BMutations";
import { formatCNPJ } from "@/lib/masks";
import { formatDateDisplay } from "@/lib/date-utils";
import { ParceiroB2BFormDialog } from "@/components/comercial/ParceiroB2BFormDialog";

const PAGE_SIZE = 20;

export default function ParceirosB2BTab() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFiltroParceiro>("ativos");
  const [partnerType, setPartnerType] = useState<string>("all");
  const [uf, setUf] = useState<string>("all");
  const [faixaDesconto, setFaixaDesconto] = useState<FaixaDescontoFiltro>("all");
  const [vinculoCliente, setVinculoCliente] = useState<VinculoClienteFiltro>("all");
  const [page, setPage] = useState(1);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ParceiroB2B | null>(null);

  const debouncedSearch = useDebounce(search, 350);
  const { data, isLoading } = useParceirosB2B({
    search: debouncedSearch,
    status,
    partnerType,
    uf,
    faixaDesconto,
    vinculoCliente,
    page,
    pageSize: PAGE_SIZE,
  });
  const softDelete = useSoftDeleteParceiroB2B();


  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
    [data?.total],
  );

  const handleNew = () => {
    setEditing(null);
    setOpenForm(true);
  };
  const handleEdit = (p: ParceiroB2B) => {
    setEditing(p);
    setOpenForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Parceiro
        </Button>
      </div>


      <Card className="p-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por código, razão social, fantasia, CNPJ ou cidade"
              className="pl-8"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v as StatusFiltroParceiro); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Apenas ativos</SelectItem>
              <SelectItem value="inativos">Apenas inativos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Select value={partnerType} onValueChange={(v) => { setPartnerType(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="distribuidor">Distribuidor</SelectItem>
              <SelectItem value="revenda">Revenda</SelectItem>
              <SelectItem value="cooperativa">Cooperativa</SelectItem>
              <SelectItem value="produtor_parceiro">Produtor Parceiro</SelectItem>
              <SelectItem value="canal_estrategico">Canal Estratégico</SelectItem>
              <SelectItem value="representante">Representante</SelectItem>
            </SelectContent>
          </Select>
          <Select value={uf} onValueChange={(v) => { setUf(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">Todas as UFs</SelectItem>
              {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={faixaDesconto} onValueChange={(v) => { setFaixaDesconto(v as FaixaDescontoFiltro); setPage(1); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Desconto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer desconto</SelectItem>
              <SelectItem value="zero">Sem desconto</SelectItem>
              <SelectItem value="1-10">1% a 10%</SelectItem>
              <SelectItem value="11-25">11% a 25%</SelectItem>
              <SelectItem value=">25">Acima de 25%</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vinculoCliente} onValueChange={(v) => { setVinculoCliente(v as VinculoClienteFiltro); setPage(1); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Vínculo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos vínculos</SelectItem>
              <SelectItem value="com">Com cliente vinculado</SelectItem>
              <SelectItem value="sem">Sem cliente vinculado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>


      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Razão Social</TableHead>
              <TableHead>Nome Fantasia</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead className="text-right">Desconto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum parceiro encontrado.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleEdit(p)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleEdit(p); } }}
                aria-label={`Abrir detalhes de ${p.razao_social}`}
              >
                <TableCell className="font-mono text-xs">{p.codigo ?? "—"}</TableCell>
                <TableCell className="font-medium">{p.razao_social}</TableCell>
                <TableCell>{p.nome_fantasia ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {p.cnpj ? formatCNPJ(p.cnpj) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {Number(p.desconto_padrao).toFixed(2)}%
                </TableCell>
                <TableCell>
                  <Badge variant={p.ativo ? "default" : "secondary"}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateDisplay(p.created_at)}
                </TableCell>
                <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => handleEdit(p)} aria-label="Editar parceiro">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      softDelete.mutate({ id: p.id, ativo: !p.ativo })
                    }
                    title={p.ativo ? "Inativar" : "Reativar"}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading && (
          <p className="text-center text-muted-foreground py-8 text-sm">Carregando...</p>
        )}
        {!isLoading && data?.items.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">
            Nenhum parceiro encontrado.
          </p>
        )}
        {data?.items.map((p) => (
          <Card
            key={p.id}
            className="p-3 space-y-1 cursor-pointer hover:bg-muted/50"
            onClick={() => handleEdit(p)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleEdit(p); } }}
            aria-label={`Abrir detalhes de ${p.razao_social}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{p.razao_social}</p>
                {p.nome_fantasia && (
                  <p className="text-xs text-muted-foreground truncate">
                    {p.nome_fantasia}
                  </p>
                )}
              </div>
              <Badge variant={p.ativo ? "default" : "secondary"}>
                {p.ativo ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {p.codigo && <span>Cód: {p.codigo}</span>}
              {p.cnpj && <span>{formatCNPJ(p.cnpj)}</span>}
              <span>Desc: {Number(p.desconto_padrao).toFixed(2)}%</span>
              <span>{formatDateDisplay(p.created_at)}</span>
            </div>
            <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEdit(p)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => softDelete.mutate({ id: p.id, ativo: !p.ativo })}
              >
                <Power className="h-3.5 w-3.5 mr-1" />
                {p.ativo ? "Inativar" : "Reativar"}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {(data?.total ?? 0) > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {data?.total} parceiro(s) • página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <ParceiroB2BFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        parceiro={editing}
      />
    </div>
  );
}
