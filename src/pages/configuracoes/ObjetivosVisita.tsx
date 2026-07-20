import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ResponsiveHelpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Info, ShieldAlert } from "lucide-react";

type Sugestao = {
  id: string;
  cultura_id: string | null;
  texto: string;
  ordem: number;
  ativo: boolean;
};

const GENERICA = "__generica__";

export default function ObjetivosVisita() {
  const { role } = useAuth();
  const canManage = role === "administrador" || role === "gestor";
  const qc = useQueryClient();

  const [filtroCultura, setFiltroCultura] = useState<string>("todas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sugestao | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [fCultura, setFCultura] = useState<string>(GENERICA);
  const [fTexto, setFTexto] = useState("");
  const [fOrdem, setFOrdem] = useState<string>("0");
  const [fAtivo, setFAtivo] = useState(true);

  const { data: culturas = [] } = useQuery({
    queryKey: ["ref-culturas"],
    queryFn: async () =>
      (await supabase.from("culturas").select("id, nome").order("nome")).data || [],
  });

  const { data: sugestoes = [], isLoading } = useQuery({
    queryKey: ["objetivos-sugestoes-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("objetivos_visita_sugestoes")
        .select("id, cultura_id, texto, ordem, ativo")
        .order("cultura_id", { nullsFirst: false })
        .order("ordem")
        .order("texto");
      if (error) throw error;
      return (data || []) as Sugestao[];
    },
  });

  const culturaNome = (id: string | null) =>
    id ? (culturas as any[]).find((c) => c.id === id)?.nome ?? "—" : "Genérica";

  const filtradas = useMemo(() => {
    if (filtroCultura === "todas") return sugestoes;
    if (filtroCultura === GENERICA) return sugestoes.filter((s) => !s.cultura_id);
    return sugestoes.filter((s) => s.cultura_id === filtroCultura);
  }, [sugestoes, filtroCultura]);

  const openNew = () => {
    setEditing(null);
    setFCultura(filtroCultura === "todas" ? GENERICA : filtroCultura);
    setFTexto("");
    setFOrdem("0");
    setFAtivo(true);
    setDialogOpen(true);
  };

  const openEdit = (s: Sugestao) => {
    setEditing(s);
    setFCultura(s.cultura_id ?? GENERICA);
    setFTexto(s.texto);
    setFOrdem(String(s.ordem ?? 0));
    setFAtivo(s.ativo);
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const texto = fTexto.trim();
      if (!texto) throw new Error("Informe o texto da sugestão.");
      const payload = {
        cultura_id: fCultura === GENERICA ? null : fCultura,
        texto,
        ordem: Number.isFinite(parseInt(fOrdem, 10)) ? parseInt(fOrdem, 10) : 0,
        ativo: fAtivo,
      };
      if (editing) {
        const { error } = await supabase
          .from("objetivos_visita_sugestoes")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("objetivos_visita_sugestoes")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Sugestão atualizada" : "Sugestão criada");
      qc.invalidateQueries({ queryKey: ["objetivos-sugestoes-admin"] });
      qc.invalidateQueries({ queryKey: ["objetivos-visita-sugestoes"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("objetivos_visita_sugestoes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sugestão excluída");
      qc.invalidateQueries({ queryKey: ["objetivos-sugestoes-admin"] });
      qc.invalidateQueries({ queryKey: ["objetivos-visita-sugestoes"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) {
    return (
      <div className="space-y-4">
        <PageHeader title="Objetivos de Visita" description="Sugestões pré-definidas exibidas no formulário de Visita Técnica." />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Acesso restrito a usuários com perfil <strong>Administrador</strong> ou <strong>Gestor</strong>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Objetivos de Visita"
        description="Gerencie as sugestões exibidas no campo 'Objetivo da visita' do formulário de Visita Técnica. Sugestões genéricas aparecem para qualquer cultura; específicas só aparecem quando a cultura correspondente é selecionada."
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end justify-between">
            <div className="space-y-1.5 w-full sm:w-72">
              <Label className="text-xs">Filtrar por cultura</Label>
              <Select value={filtroCultura} onValueChange={setFiltroCultura}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value={GENERICA}>Genéricas (sem cultura)</SelectItem>
                  {(culturas as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nova sugestão
            </Button>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Cultura</TableHead>
                  <TableHead>Texto</TableHead>
                  <TableHead className="w-[80px] text-center">Ordem</TableHead>
                  <TableHead className="w-[90px] text-center">Status</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
                ) : filtradas.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhuma sugestão.</TableCell></TableRow>
                ) : (
                  filtradas.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {s.cultura_id ? (
                          <Badge variant="outline">{culturaNome(s.cultura_id)}</Badge>
                        ) : (
                          <Badge variant="secondary">Genérica</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{s.texto}</TableCell>
                      <TableCell className="text-center">{s.ordem}</TableCell>
                      <TableCell className="text-center">
                        {s.ativo
                          ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge>
                          : <Badge variant="outline">Inativo</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
          As sugestões de objetivo de visita são apenas auxiliares ao preenchimento técnico.
          Toda recomendação ou conduta agronômica deve estar respaldada por prescrição
          do responsável técnico habilitado, conforme legislação vigente.
        </AlertDescription>
      </Alert>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar sugestão" : "Nova sugestão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cultura</Label>
              <Select value={fCultura} onValueChange={setFCultura}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GENERICA}>Genérica (qualquer cultura)</SelectItem>
                  {(culturas as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto da sugestão</Label>
              <Input value={fTexto} onChange={(e) => setFTexto(e.target.value)} placeholder="Ex: Avaliar pressão de lagartas" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ordem</Label>
                <Input type="number" value={fOrdem} onChange={(e) => setFOrdem(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ativo</Label>
                <div className="h-10 flex items-center">
                  <Switch checked={fAtivo} onCheckedChange={setFAtivo} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sugestão?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A sugestão deixará de aparecer no formulário de Visita Técnica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove.mutate(deleteId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
