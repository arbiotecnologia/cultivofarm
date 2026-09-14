import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { EmbalagemStatusBadge } from "./EmbalagemStatusBadge";
import { ScanLine } from "lucide-react";

const MSG_ERRO_CONFERENCIA = "Não foi possível conferir este código. Tente novamente.";

export function ConferenciaEmbalagemQR({ entregaId }: { entregaId?: string }) {
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Token monotônico: invalida respostas de leituras antigas (inclusive A→B→A).
  const tokenRef = useRef(0);
  // Trava síncrona: impede segunda chamada antes da anterior terminar.
  const emAndamentoRef = useRef(false);

  useEffect(() => {
    tokenRef.current += 1;
    emAndamentoRef.current = false;
    setCodigo("");
    setResult(null);
    setErro(null);
    setLoading(false);
    return () => {
      tokenRef.current += 1;
      emAndamentoRef.current = false;
    };
  }, [entregaId]);

  const conferir = async () => {
    const alvo = codigo.trim();
    // A leitura gera movimentação no servidor: nunca chamar vazio nem em duplicidade.
    if (!alvo) return;
    if (emAndamentoRef.current) return;
    emAndamentoRef.current = true;

    const token = ++tokenRef.current;
    const entregaDaLeitura = entregaId;
    setLoading(true);
    setErro(null);
    setResult(null);
    try {
      const { data, error } = await (supabase as any).rpc("rpc_ler_embalagem_por_qr", {
        p_codigo_ou_token: alvo,
      });
      if (token !== tokenRef.current || entregaDaLeitura !== entregaId) return;
      if (error) throw error;
      setResult(data);
    } catch {
      if (token !== tokenRef.current || entregaDaLeitura !== entregaId) return;
      setErro(MSG_ERRO_CONFERENCIA);
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
        emAndamentoRef.current = false;
      }
    }
  };

  const semVinculo = !!result?.found && !result.entrega_id;
  const divergente = !!result?.found && !!entregaId && !!result.entrega_id && result.entrega_id !== entregaId;
  const pertence = !!result?.found && !!entregaId && result.entrega_id === entregaId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          Conferência por QR
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Label htmlFor="conferencia-qr-codigo" className="sr-only">
            Código da embalagem, etiqueta ou token
          </Label>
          <Input
            id="conferencia-qr-codigo"
            value={codigo}
            // Editar o código descarta o resultado anterior: nunca exibir leitura
            // de um código que não é mais o do campo.
            onChange={(e) => {
              if (emAndamentoRef.current) return; // leitura pendente: campo travado
              setCodigo(e.target.value);
              setResult(null);
              setErro(null);
            }}
            readOnly={loading}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (loading || !codigo.trim()) return;
              void conferir();
            }}
            placeholder="Cole ou escaneie o código (embalagem, etiqueta ou token)"
            autoFocus
          />
          <Button onClick={() => void conferir()} disabled={loading || !codigo.trim()}>
            {loading ? "Conferindo…" : "Conferir"}
          </Button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground" data-testid="qr-carregando">
            Conferindo código…
          </p>
        )}

        {erro && (
          <p className="text-sm text-destructive" data-testid="qr-erro">
            {erro}
          </p>
        )}

        {!loading && !erro && result?.found === false && (
          <p className="text-sm text-muted-foreground">Nenhuma embalagem encontrada.</p>
        )}

        {!loading && !erro && result?.found && (
          <div className="border rounded-md p-3 text-sm space-y-1">
            <div className="flex justify-between items-center">
              <div className="font-mono font-semibold">{result.codigo_embalagem}</div>
              <EmbalagemStatusBadge status={result.status} />
            </div>
            <div>
              Volume: {result.volume} {result.unidade}
            </div>
            <div>Validade: {result.validade_em ?? "—"}</div>
            {semVinculo && (
              <p className="text-destructive font-medium" data-testid="qr-sem-vinculo">
                ⚠ Embalagem não vinculada a esta entrega
              </p>
            )}
            {entregaId && divergente && (
              <p className="text-destructive font-medium" data-testid="qr-divergente">
                ⚠ Embalagem não pertence a esta entrega
              </p>
            )}
            {entregaId && pertence && (
              <p className="text-emerald-700 font-medium" data-testid="qr-pertence">
                ✓ Embalagem pertence a esta entrega
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
