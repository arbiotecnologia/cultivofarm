import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { formatTelefone, unmask } from "@/lib/masks";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface ClienteContatosTabProps {
  clienteId: string;
}

interface Contato {
  id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
}

export function ClienteContatosTab({ clienteId }: ClienteContatosTabProps) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Contato> | null>(null);

  const fetchContatos = async () => {
    if (!clienteId) return;
    const { data } = await supabase
      .from("cliente_contatos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("principal", { ascending: false });
    if (data) setContatos(data as Contato[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchContatos();
  }, [clienteId]);

  const handleSave = async () => {
    if (!editing?.nome) return;
    
    setLoading(true);
    try {
      const payload: any = { 
        ...editing, 
        cliente_id: clienteId,
        nome: editing.nome,
        telefone: unmask(editing.telefone)
      };
      
      const { id } = payload;
      delete payload.id;

      if (id) {
        const { error } = await supabase.from("cliente_contatos").update(payload).eq("id", id);
        if (error) throw error;
        toast.success("Contato atualizado!");
      } else {
        const { error } = await supabase.from("cliente_contatos").insert([payload]);
        if (error) throw error;
        toast.success("Contato adicionado!");
      }
      setEditing(null);
      await fetchContatos();
    } catch (error: any) {
      console.error("Erro ao salvar contato:", error);
      toast.error("Erro ao salvar contato: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("cliente_contatos").delete().eq("id", id);
      if (error) throw error;
      toast.success("Contato removido!");
      fetchContatos();
    } catch (error: any) {
      toast.error("Erro ao remover contato: " + error.message);
    }
  };

  if (!clienteId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
        <div className="bg-muted p-4 rounded-full">
          <UserCircle className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="max-w-[280px]">
          <h3 className="font-medium">Salvar Cliente Necessário</h3>
          <p className="text-sm text-muted-foreground">Para gerenciar contatos adicionais, você precisa primeiro salvar o cadastro básico do cliente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">Contatos Adicionais</h3>
        <Button size="sm" onClick={() => setEditing({ nome: "", principal: false })}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>

      {editing && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={editing.nome} onChange={e => setEditing({...editing, nome: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Input value={editing.cargo || ""} onChange={e => setEditing({...editing, cargo: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={editing.email || ""} onChange={e => setEditing({...editing, email: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <MaskedInput 
                mask="telefone" 
                value={editing.telefone || ""} 
                onChange={e => setEditing({...editing, telefone: e.target.value})} 
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Salvar</Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {loading && !editing && (
          <div className="text-center py-4 text-muted-foreground text-xs animate-pulse">
            Carregando contatos...
          </div>
        )}
        {!loading && contatos.length === 0 && !editing && (
          <div className="text-center py-8 border rounded-lg border-dashed text-muted-foreground text-sm">
            Nenhum contato adicional cadastrado.
          </div>
        )}
        {contatos.map(c => (
          <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-full">
                <UserCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm flex items-center gap-2">
                  {c.nome} 
                  {c.principal && <Badge variant="secondary" className="text-[9px] h-4 px-1">PRINCIPAL</Badge>}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {c.cargo && <span>{c.cargo}</span>}
                  {c.telefone && <span>• {formatTelefone(c.telefone)}</span>}
                  {c.email && <span>• {c.email}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(c)}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(c.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

