import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EmbalagemStatusBadge } from "./EmbalagemStatusBadge";
import { ScanLine } from "lucide-react";

export function ConferenciaEmbalagemQR({ entregaId }: { entregaId?: string }) {
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  const conferir = async () => {
    setLoading(true); setErro(null); setResult(null);
    try {
      const { data, error } = await (supabase as any).rpc("rpc_ler_embalagem_por_qr", { p_codigo_ou_token: codigo.trim() });
      if (error) throw error;
      setResult(data);
    } catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };

  const divergente = result?.found && entregaId && result.entrega_id && result.entrega_id !== entregaId;
  const pertence = result?.found && entregaId && result.entrega_id === entregaId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><ScanLine className="h-4 w-4" />Conferência por QR</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && conferir()}
            placeholder="Cole ou escaneie o código (embalagem, etiqueta ou token)"
            autoFocus
          />
          <Button onClick={conferir} disabled={loading || !codigo.trim()}>Conferir</Button>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {result?.found === false && <p className="text-sm text-muted-foreground">Nenhuma embalagem encontrada.</p>}
        {result?.found && (
          <div className="border rounded-md p-3 text-sm space-y-1">
            <div className="flex justify-between items-center">
              <div className="font-mono font-semibold">{result.codigo_embalagem}</div>
              <EmbalagemStatusBadge status={result.status} />
            </div>
            <div>Volume: {result.volume} {result.unidade}</div>
            <div>Validade: {result.validade_em ?? "—"}</div>
            {entregaId && divergente && (
              <p className="text-destructive font-medium">⚠ Embalagem não pertence a esta entrega</p>
            )}
            {entregaId && pertence && (
              <p className="text-emerald-700 font-medium">✓ Embalagem pertence a esta entrega</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
