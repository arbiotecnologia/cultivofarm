import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export type CatalogTipoFiltro = "todos" | "produto" | "microrganismo";
export type CatalogStatusFiltro = "todos" | "aprovado" | "em_revisao" | "rascunho" | "sem_ficha";

interface Props {
  search: string;
  onSearch: (v: string) => void;
  tipo: CatalogTipoFiltro;
  onTipo: (v: CatalogTipoFiltro) => void;
  status: CatalogStatusFiltro;
  onStatus: (v: CatalogStatusFiltro) => void;
  b2b: "todos" | "sim" | "nao";
  onB2b: (v: "todos" | "sim" | "nao") => void;
  /** Esconde o select de status da ficha (default: visível) */
  showStatus?: boolean;
  /** Esconde o select de B2B (default: visível) */
  showB2b?: boolean;
}

export function CatalogSearchFilters({
  search, onSearch, tipo, onTipo, status, onStatus, b2b, onB2b,
  showStatus = true, showB2b = true,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar por nome, código, função, alvo..." value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <Select value={tipo} onValueChange={(v) => onTipo(v as CatalogTipoFiltro)}>
        <SelectTrigger className="w-full md:w-40" aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os tipos</SelectItem>
          <SelectItem value="produto">Produtos</SelectItem>
          <SelectItem value="microrganismo">Microrganismos</SelectItem>
        </SelectContent>
      </Select>
      {showStatus && (
        <Select value={status} onValueChange={(v) => onStatus(v as CatalogStatusFiltro)}>
          <SelectTrigger className="w-full md:w-40" aria-label="Filtrar por status da ficha"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="em_revisao">Em revisão</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="sem_ficha">Sem ficha</SelectItem>
          </SelectContent>
        </Select>
      )}
      {showB2b && (
        <Select value={b2b} onValueChange={(v) => onB2b(v as any)}>
          <SelectTrigger className="w-full md:w-32" aria-label="Filtrar por B2B"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">B2B: Todos</SelectItem>
            <SelectItem value="sim">B2B: Sim</SelectItem>
            <SelectItem value="nao">B2B: Não</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

