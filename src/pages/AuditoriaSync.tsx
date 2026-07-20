import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Image as ImageIcon,
  FileText,
  Mic,
} from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import {
  getPendingRegistros,
  getPendingCheckins,
  releasePendingRegistro,
  releasePendingCheckin,
  removePendingRegistro,
  removePendingCheckin,
  getFotosForRegistro,
  updatePendingFoto,
  type PendingFoto,
} from "@/lib/offlineDb";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateTimeDisplay } from "@/lib/date-utils";

interface PendingRow {
  id: string;
  tipo: "registro" | "checkin";
  createdAt: string;
  syncing: boolean;
  fotosCount?: number;
  resumo: string;
}

interface PendingMediaRow extends PendingFoto {
  registroResumo: string;
}

export default function AuditoriaSync() {
  const { isOnline, pendingCount, syncing, syncAll } = useOfflineSync();
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  const [pendingMedia, setPendingMedia] = useState<PendingMediaRow[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [regs, checks] = await Promise.all([
        getPendingRegistros().catch(() => []),
        getPendingCheckins().catch(() => []),
      ]);
      const rows: PendingRow[] = [];
      const mediaRows: PendingMediaRow[] = [];
      for (const r of regs as any[]) {
        const fotos = await getFotosForRegistro(r.id).catch(() => []);
        const resumo =
          r.payload?.objetivo_visita ||
          r.payload?.problema_principal ||
          "Visita em rascunho";
        rows.push({
          id: r.id,
          tipo: "registro",
          createdAt: r.createdAt,
          syncing: !!r.syncingAt,
          fotosCount: fotos.length,
          resumo,
        });
        for (const f of fotos) {
          if (!f.uploaded && (f.uploadAttempts || 0) > 0) {
            mediaRows.push({ ...f, registroResumo: resumo });
          }
        }
      }
      for (const c of checks as any[]) {
        rows.push({
          id: c.id,
          tipo: "checkin",
          createdAt: c.createdAt,
          syncing: !!c.syncingAt,
          resumo: `Check-in (${c.payload?.tipo_checkin || "—"})`,
        });
      }
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setPendingRows(rows);
      setPendingMedia(mediaRows);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [refreshTick, pendingCount, syncing]);

  // Histórico do banco
  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ["sync-log", refreshTick],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as any[]) || [];
    },
  });

  const errosRecentes = logs?.filter((l) => l.status === "erro").length || 0;
  const sucessoRecentes = logs?.filter((l) => l.status === "sucesso").length || 0;
  const tentativasRecentes = logs?.filter((l) => l.status === "tentativa").length || 0;

  const handleForceRelease = async (row: PendingRow) => {
    try {
      if (row.tipo === "registro") await releasePendingRegistro(row.id);
      else await releasePendingCheckin(row.id);
      toast.success("Item liberado para nova tentativa");
      setRefreshTick((t) => t + 1);
    } catch (err: any) {
      toast.error(err.message || "Falha ao liberar");
    }
  };

  const handleDiscard = async (row: PendingRow) => {
    if (!confirm("Descartar permanentemente este item da fila offline?")) return;
    try {
      if (row.tipo === "registro") await removePendingRegistro(row.id);
      else await removePendingCheckin(row.id);
      toast.success("Item removido da fila");
      setRefreshTick((t) => t + 1);
    } catch (err: any) {
      toast.error(err.message || "Falha ao remover");
    }
  };

  const handleRetryMedia = async (foto: PendingMediaRow) => {
    try {
      // Reseta tentativas para forçar nova tentativa imediata
      await updatePendingFoto(foto.id, { uploadAttempts: 0, lastUploadError: null });
      toast.success("Mídia liberada — sincronize novamente");
      setRefreshTick((t) => t + 1);
    } catch (err: any) {
      toast.error(err.message || "Falha ao liberar mídia");
    }
  };

  const handleDiscardMedia = async (foto: PendingMediaRow) => {
    if (!confirm("Descartar esta mídia? O registro permanecerá na fila.")) return;
    try {
      // Marca como uploaded para que o registro pai possa concluir sem ela
      await updatePendingFoto(foto.id, { uploaded: true, lastUploadError: "descartada pelo usuário" });
      toast.success("Mídia descartada");
      setRefreshTick((t) => t + 1);
    } catch (err: any) {
      toast.error(err.message || "Falha ao descartar");
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Limpar todo o histórico de sincronização? Esta ação é irreversível.")) return;
    const { error } = await supabase
      .from("sync_log" as any)
      .delete()
      .gte("created_at", "1970-01-01");
    if (error) toast.error(error.message);
    else {
      toast.success("Histórico limpo");
      refetchLogs();
    }
  };

  const tipoIcon = (tipo: string) => {
    switch (tipo) {
      case "foto":
        return <ImageIcon className="h-3 w-3" />;
      case "audio":
        return <Mic className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "sucesso":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            sucesso
          </Badge>
        );
      case "erro":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            erro
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            tentativa
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Auditoria de Sincronização</h1>
          <p className="text-sm text-muted-foreground">
            Monitore a fila offline, tentativas e erros de envio
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={isOnline ? "default" : "destructive"}>
            {isOnline ? "Online" : "Offline"}
          </Badge>
          <Button onClick={() => syncAll()} disabled={!isOnline || syncing} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Na fila local</p>
            <p className="text-3xl font-bold mt-1">{pendingRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Em sincronização</p>
            <p className="text-3xl font-bold mt-1 text-amber-600">
              {pendingRows.filter((r) => r.syncing).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Erros recentes</p>
            <p className="text-3xl font-bold mt-1 text-destructive">{errosRecentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sucessos</p>
            <p className="text-3xl font-bold mt-1 text-emerald-600">{sucessoRecentes}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="fila">
        <TabsList>
          <TabsTrigger value="fila">Fila offline ({pendingRows.length})</TabsTrigger>
          <TabsTrigger value="midias">
            Mídias travadas ({pendingMedia.length})
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico ({logs?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="fila">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Itens aguardando envio</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRows.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  Nenhum item pendente — tudo sincronizado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Resumo</TableHead>
                      <TableHead>Anexos</TableHead>
                      <TableHead>Criado</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[180px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {row.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{row.resumo}</TableCell>
                        <TableCell>
                          {row.fotosCount ? (
                            <span className="flex items-center gap-1 text-xs">
                              <ImageIcon className="h-3 w-3" /> {row.fotosCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.createdAt
                            ? formatDateTimeDisplay(row.createdAt)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {row.syncing ? (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              syncing
                            </Badge>
                          ) : (
                            <Badge variant="secondary">aguardando</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {row.syncing && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleForceRelease(row)}
                                title="Liberar item travado"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDiscard(row)}
                              title="Descartar"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="midias">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Mídias com falha de upload
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Fotos/áudios cuja sincronização falhou. O registro pai permanece
                na fila até cada mídia ser confirmada no storage.
              </p>
            </CardHeader>
            <CardContent>
              {pendingMedia.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  Nenhuma mídia travada.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Registro</TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Último erro</TableHead>
                      <TableHead className="w-[180px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingMedia.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-xs">
                          {m.registroResumo}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" />
                            {m.fileName}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              (m.uploadAttempts || 0) >= 3
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {m.uploadAttempts || 0}/3
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {m.lastUploadError || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRetryMedia(m)}
                              title="Tentar novamente"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDiscardMedia(m)}
                              title="Descartar mídia"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Histórico de envios</CardTitle>
              <Button size="sm" variant="ghost" onClick={handleClearLogs}>
                <Trash2 className="h-3 w-3 mr-1" /> Limpar histórico
              </Button>
            </CardHeader>
            <CardContent>
              {!logs?.length ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  Nenhum registro de sincronização ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Tentativa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mensagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            <span className="mr-1">{tipoIcon(log.tipo_item)}</span>
                            {log.tipo_item}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">#{log.tentativa}</TableCell>
                        <TableCell>{statusBadge(log.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                          {log.mensagem_erro || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
