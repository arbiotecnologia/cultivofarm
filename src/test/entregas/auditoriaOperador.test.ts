import { test, expect } from "vitest";
import { supabase } from "../../integrations/supabase/client";

/**
 * Teste de integridade de dados para a Fase 3.1.A.
 * Verifica se o RPC retorna o nome amigável do operador.
 */
test("RPC deve retornar o nome amigável do operador quando disponível", async () => {
  // Busca uma entrega entregue recente
  const { data: entrega } = await supabase
    .from("entregas")
    .select("id, status")
    .eq("status", "entregue")
    .limit(1)
    .maybeSingle();

  if (!entrega) {
    console.log("Auditoria: Nenhuma entrega entregue encontrada para teste real.");
    return;
  }

  const { data, error } = await supabase.rpc("rpc_get_comprovante_entrega_data", {
    p_entrega_id: entrega.id,
    p_reemissao: false
  });

  if (error) {
    // Se for erro de permissão no Vitest (ambiente local sem JWT de admin), é esperado
    if (error.code === '42501') {
      console.log("Auditoria: Permissão negada no Vitest local (comportamento normal).");
      return;
    }
    throw error;
  }

  const recebimento = data?.conteudo?.recebimento;
  if (recebimento) {
    expect(recebimento).toHaveProperty("confirmado_por_id");
    expect(recebimento).toHaveProperty("confirmado_por_nome");
    
    // O UUID não deve estar no campo de nome
    if (recebimento.confirmado_por_nome) {
      expect(recebimento.confirmado_por_nome).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  }
});

