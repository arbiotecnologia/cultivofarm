import { formatDateTimeDisplay } from "@/lib/date-utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AutorTipo = "produtor" | "tecnico" | "gestor" | "admin";

interface Comentario {
  id: string;
  recomendacao_id: string;
  autor_id: string;
  autor_tipo: AutorTipo;
  autor_nome: string;
  mensagem: string;
  lido_em: string | null;
  created_at: string;
}

function mapRoleToAutorTipo(role: string | null): AutorTipo {
  if (role === "cliente_produtor") return "produtor";
  if (role === "administrador") return "admin";
  if (role === "gestor") return "gestor";
  return "tecnico";
}

interface Props {
  recomendacaoId: string;
  defaultOpen?: boolean;
  compact?: boolean;
}

export function RecomendacaoChat({ recomendacaoId, defaultOpen = false, compact = false }: Props) {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [texto, setTexto] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const autorTipo = mapRoleToAutorTipo(role);
  const queryKey = ["recomendacao_chat", recomendacaoId];

  const { data: comentarios = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("recomendacao_comentarios")
        .select("*")
        .eq("recomendacao_id", recomendacaoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Comentario[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`rec_chat_${recomendacaoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recomendacao_comentarios",
          filter: `recomendacao_id=eq.${recomendacaoId}`,
        },
        () => queryClient.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recomendacaoId]);

  // Auto-scroll on new
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comentarios.length, open]);

  // Mark messages from counterpart as read on open
  useEffect(() => {
    if (!open || !user) return;
    const unread = comentarios.filter(
      (c) => !c.lido_em && c.autor_id !== user.id
    );
    if (unread.length === 0) return;
    (supabase as any)
      .from("recomendacao_comentarios")
      .update({ lido_em: new Date().toISOString() })
      .in("id", unread.map((c) => c.id))
      .then(() => queryClient.invalidateQueries({ queryKey }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, comentarios, user?.id]);

  const enviar = useMutation({
    mutationFn: async (mensagem: string) => {
      if (!user) throw new Error("Não autenticado");
      const { error } = await (supabase as any)
        .from("recomendacao_comentarios")
        .insert({
          recomendacao_id: recomendacaoId,
          autor_id: user.id,
          autor_tipo: autorTipo,
          autor_nome: profile?.nome || user.email || "Usuário",
          mensagem: mensagem.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const naoLidas = useMemo(
    () => comentarios.filter((c) => !c.lido_em && c.autor_id !== user?.id).length,
    [comentarios, user?.id]
  );

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!texto.trim() || enviar.isPending) return;
    enviar.mutate(texto);
  };

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors rounded-t-lg"
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Conversa com {autorTipo === "produtor" ? "o consultor" : "o produtor"}
          {comentarios.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({comentarios.length})
            </span>
          )}
        </span>
        {naoLidas > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5 px-2">
            {naoLidas} nova{naoLidas > 1 ? "s" : ""}
          </Badge>
        )}
      </button>

      {open && (
        <div className="border-t">
          <div
            ref={listRef}
            className={cn(
              "px-3 py-3 space-y-2 overflow-y-auto bg-muted/20",
              compact ? "max-h-60" : "max-h-80"
            )}
          >
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : comentarios.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma mensagem ainda.{" "}
                {autorTipo === "produtor"
                  ? "Tire dúvidas com o consultor antes de decidir."
                  : "Aguardando interação do produtor."}
              </p>
            ) : (
              comentarios.map((c) => {
                const mine = c.autor_id === user?.id;
                return (
                  <div
                    key={c.id}
                    className={cn("flex", mine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm",
                        mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border"
                      )}
                    >
                      {!mine && (
                        <div className="text-[10px] font-semibold opacity-80 mb-0.5">
                          {c.autor_nome}
                          <span className="ml-1 font-normal opacity-70">
                            · {c.autor_tipo === "produtor" ? "Produtor" : "Consultor"}
                          </span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words leading-snug">
                        {c.mensagem}
                      </p>
                      <div
                        className={cn(
                          "text-[10px] mt-1 opacity-70",
                          mine ? "text-right" : "text-left"
                        )}
                        title={formatDateTimeDisplay(c.created_at)}
                      >
                        {formatDistanceToNow(new Date(c.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 p-2 border-t bg-background rounded-b-lg"
          >
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Escreva uma mensagem..."
              rows={1}
              className="resize-none min-h-[36px] max-h-32 text-sm flex-1"
              disabled={enviar.isPending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!texto.trim() || enviar.isPending}
              className="h-9 w-9 shrink-0"
            >
              {enviar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
