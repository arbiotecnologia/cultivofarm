import { useAlertasSLA } from "@/hooks/useAlertasSLA";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function AlertasSLAConfigTable() {
  const { configsSLA, loading } = useAlertasSLA();

  if (loading) return <p className="text-sm text-muted-foreground">Carregando configurações...</p>;
  if (!configsSLA.length) return <p className="text-sm text-muted-foreground">Sem configurações de SLA.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Gravidade</TableHead>
          <TableHead>1ª resposta (min)</TableHead>
          <TableHead>Resolução (min)</TableHead>
          <TableHead>Escalonar após (min)</TableHead>
          <TableHead>Nova gravidade</TableHead>
          <TableHead>Notificar gestor</TableHead>
          <TableHead>Ativo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {configsSLA.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
            <TableCell><Badge variant="outline">{c.gravidade}</Badge></TableCell>
            <TableCell>{c.prazo_primeira_resposta_minutos ?? "—"}</TableCell>
            <TableCell>{c.prazo_resolucao_minutos === 0 ? "Sem SLA" : c.prazo_resolucao_minutos}</TableCell>
            <TableCell>{c.escalonar_apos_minutos ?? "—"}</TableCell>
            <TableCell>{c.nova_gravidade_apos_sla ?? "—"}</TableCell>
            <TableCell>{c.notificar_gestor ? "Sim" : "Não"}</TableCell>
            <TableCell>{c.ativo ? "Sim" : "Não"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
