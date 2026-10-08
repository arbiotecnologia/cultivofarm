import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateDisplay } from "@/lib/date-utils";
import {
  usePartnerUsers,
  useAvailablePartnerUsers,
  useLinkPartnerUser,
  useUnlinkPartnerUser,
  PARTNER_REGISTRATION_UNAVAILABLE,
  type PartnerUserPapel,
} from "@/hooks/usePartnerUsers";

interface Props {
  partnerId: string;
}

function derivePapel(roles: string[] | undefined): PartnerUserPapel {
  return (roles ?? []).includes("parceiro_b2b_tecnico") ? "tecnico" : "gestor";
}

export function ParceiroUsuariosTab({ partnerId }: Props) {
  const { data: linked = [], isLoading, isError, refetch } = usePartnerUsers(partnerId);
  const { data: available = [] } = useAvailablePartnerUsers(partnerId);
  const link = useLinkPartnerUser(partnerId);
  const unlink = useUnlinkPartnerUser(partnerId);
  const [selected, setSelected] = useState<string>("");

  const selectedUser = available.find((u) => u.user_id === selected);
  const selectedPapel = selectedUser ? derivePapel(selectedUser.roles) : null;

  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">{PARTNER_REGISTRATION_UNAVAILABLE}</p>
      {isError && <div role="alert"><p>Não foi possível comprovar a empresa do parceiro ou carregar os acessos.</p><Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div>}
      <Card className="p-3 flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label className="text-sm font-medium">Vincular usuário ao parceiro</label>
          <Select value={selected} onValueChange={setSelected} disabled>
            <SelectTrigger>
              <SelectValue placeholder={available.length ? "Selecione um usuário disponível" : "Nenhum usuário com perfil Parceiro B2B ou Técnico B2B disponível"} />
            </SelectTrigger>
            <SelectContent>
              {available.map((u) => {
                const p = derivePapel(u.roles);
                return (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    <span className="flex items-center gap-2">
                      <span>{u.nome ?? u.email ?? u.user_id}</span>
                      {u.email && u.nome && <span className="text-xs text-muted-foreground">· {u.email}</span>}
                      <Badge variant={p === "tecnico" ? "secondary" : "outline"} className="text-[10px]">
                        {p === "tecnico" ? "Técnico" : "Gestor"}
                      </Badge>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {selectedPapel && (
            <p className="text-xs text-muted-foreground mt-1">
              Será vinculado como{" "}
              <strong>{selectedPapel === "tecnico" ? "Técnico" : "Gestor"}</strong> (conforme perfil do usuário).
            </p>
          )}
        </div>
        <Button
          disabled
          onClick={() => {
            if (!selectedPapel) return;
            link.mutate(
              { user_id: selected, papel: selectedPapel },
              { onSuccess: () => setSelected("") },
            );
          }}
        >
          <UserPlus className="h-4 w-4 mr-1" /> Vincular
        </Button>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Vinculado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && !isError && linked.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum usuário vinculado.</TableCell></TableRow>
            )}
            {linked.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome ?? "—"}</TableCell>
                <TableCell className="text-sm">{u.email ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.papel === "tecnico" ? "secondary" : "outline"}>
                    {u.papel === "tecnico" ? "Técnico" : "Gestor"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateDisplay(u.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => unlink.mutate(u.id)}
                    disabled
                    title="Remoção de vínculo indisponível"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <Badge variant="outline" className="mr-1">Gestor</Badge>
          recebe o perfil <strong>Parceiro B2B</strong> e enxerga preços com desconto, envia pedidos e acessa financeiro.
        </p>
        <p>
          <Badge variant="secondary" className="mr-1">Técnico</Badge>
          recebe o perfil <strong>Parceiro B2B (Técnico)</strong>, vê catálogo com preço cheio, acessa fichas técnicas completas e monta simulações — sem enviar pedidos nem ver o financeiro.
        </p>
        <p className="italic">
          O papel é definido pelo perfil do usuário. Para trocar de Gestor para Técnico (ou vice-versa),
          a alteração permanece indisponível até a integração segura do cadastro B2B.
        </p>
      </div>
    </div>
  );
}
