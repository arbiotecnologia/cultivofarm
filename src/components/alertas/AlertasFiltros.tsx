import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AlertasFiltros as Filtros } from "@/hooks/useAlertasOperacionais";

interface Props {
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
}

export function AlertasFiltros({ filtros, setFiltros }: Props) {
  const update = (patch: Partial<Filtros>) => setFiltros({ ...filtros, ...patch });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div>
        <Label className="text-xs">Status</Label>
        <Select value={filtros.status ?? "todos"} onValueChange={(v) => update({ status: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="lido">Lido</SelectItem>
            <SelectItem value="reaberto">Reaberto</SelectItem>
            <SelectItem value="resolvido">Resolvido</SelectItem>
            <SelectItem value="ignorado">Ignorado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Gravidade</Label>
        <Select value={filtros.gravidade ?? "todas"} onValueChange={(v) => update({ gravidade: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="informativa">Informativa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Origem</Label>
        <Select value={filtros.origem ?? "todas"} onValueChange={(v) => update({ origem: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="visita">Visita</SelectItem>
            <SelectItem value="recomendacao">Recomendação</SelectItem>
            <SelectItem value="laboratorio">Laboratório</SelectItem>
            <SelectItem value="cq">CQ</SelectItem>
            <SelectItem value="estoque">Estoque</SelectItem>
            <SelectItem value="entrega">Entrega</SelectItem>
            <SelectItem value="bi">BI</SelectItem>
            <SelectItem value="sistema">Sistema</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Tipo</Label>
        <Input
          value={filtros.tipo ?? ""}
          onChange={(e) => update({ tipo: e.target.value || undefined })}
          placeholder="ex: cq_reprovado"
        />
      </div>

      <div>
        <Label className="text-xs">Período - início</Label>
        <Input
          type="date"
          value={filtros.periodoInicio ?? ""}
          onChange={(e) => update({ periodoInicio: e.target.value || undefined })}
        />
      </div>
      <div>
        <Label className="text-xs">Período - fim</Label>
        <Input
          type="date"
          value={filtros.periodoFim ?? ""}
          onChange={(e) => update({ periodoFim: e.target.value || undefined })}
        />
      </div>

      <div className="flex items-end gap-2">
        <Switch
          id="somenteCriticos"
          checked={!!filtros.somenteCriticos}
          onCheckedChange={(v) => update({ somenteCriticos: v })}
        />
        <Label htmlFor="somenteCriticos">Somente críticos</Label>
      </div>
      <div className="flex items-end gap-2">
        <Switch
          id="geradoAutomaticamente"
          checked={!!filtros.geradoAutomaticamente}
          onCheckedChange={(v) => update({ geradoAutomaticamente: v })}
        />
        <Label htmlFor="geradoAutomaticamente">Apenas automáticos</Label>
      </div>
      <div className="flex items-end gap-2">
        <Switch
          id="apenasMeusAlertas"
          checked={!!filtros.apenasMeusAlertas}
          onCheckedChange={(v) => update({ apenasMeusAlertas: v })}
        />
        <Label htmlFor="apenasMeusAlertas">Meus alertas</Label>
      </div>
      <div className="flex items-end gap-2">
        <Switch
          id="apenasNaoLidos"
          checked={!!filtros.apenasNaoLidos}
          onCheckedChange={(v) => update({ apenasNaoLidos: v })}
        />
        <Label htmlFor="apenasNaoLidos">Não lidos</Label>
      </div>
      <div className="flex items-end gap-2">
        <Switch
          id="apenasAltaPrioridade"
          checked={!!filtros.apenasAltaPrioridade}
          onCheckedChange={(v) => update({ apenasAltaPrioridade: v })}
        />
        <Label htmlFor="apenasAltaPrioridade">Alta prioridade</Label>
      </div>
    </div>
  );
}
