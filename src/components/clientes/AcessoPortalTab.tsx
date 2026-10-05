import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, Info, Loader2 } from "lucide-react";
import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useNavigate } from "react-router-dom";
import { ROLE_LABELS, ROLE_VARIANTS } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  clienteId: string;
}

interface PortalUser {
  id: string;
  user_id: string;
  nome: string;
  email: string | null;
  ativo: boolean;
  last_sign_in_at: string | null;
  roles: string[];
  principal: boolean;
}

export function AcessoPortalTab({ clienteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = async () => {
    if (!clienteId) return;
    setLoading(true);
    setUsers([]);
    try {
      const { data, error } = await supabase.functions.invoke("list-portal-users", { body: { cliente_id: clienteId } });
      if (error) throw error;
      setUsers(data?.users ?? []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao listar usuários do portal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clienteId, user?.id]);

  if (!clienteId) {
    return <p className="text-sm text-muted-foreground">Salve o cliente primeiro para visualizar quem tem acesso.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Usuários com acesso a este cliente</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Esta lista é apenas informativa. Para criar, vincular ou alterar acessos, use <strong>Configurações › Usuários</strong>.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : users.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground space-y-3">
          <div className="flex items-center justify-center gap-2"><Info className="h-4 w-4" /> Nenhum usuário vinculado a este cliente.</div>
          <Button variant="outline" size="sm" onClick={() => navigate("/configuracoes?tab=usuarios")}>
            Ir para Gestão de Usuários <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(u.roles || []).map(r => (
                          <Badge key={r} variant={ROLE_VARIANTS[r] || "outline"} className="text-[10px]">
                            {ROLE_LABELS[r] || r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.principal
                        ? <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">Principal</Badge>
                        : <Badge variant="outline">Secundário</Badge>}
                    </TableCell>
                    <TableCell>
                      {u.ativo
                        ? <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Ativo</Badge>
                        : <Badge variant="secondary">Inativo</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTimeDisplay(u.last_sign_in_at) || "Nunca acessou"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/configuracoes?tab=usuarios&user_id=${u.user_id}`)}
                        title="Abrir em Gestão de Usuários"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/configuracoes?tab=usuarios")}>
            Abrir Gestão de Usuários <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </>
      )}
    </div>
  );
}
