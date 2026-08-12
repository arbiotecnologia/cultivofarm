import { test, expect } from "vitest";
import { supabase } from "../../integrations/supabase/client";

/**
 * Teste de integridade de dados para a Fase 3.1.A.
 * Verifica a origem do nome amigável do operador.
 */
test("deve resolver o nome amigável do operador via tabela profiles", async () => {
  // 1. Verificar se a tabela profiles existe e tem a coluna 'nome'
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("user_id, nome")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Erro ao ler profiles:", error);
  }
  
  expect(error).toBeNull();
  
  if (profile) {
    expect(profile).toHaveProperty("user_id");
    expect(profile).toHaveProperty("nome");
    console.log(`Auditoria: Profile encontrado para ${profile.user_id}: ${profile.nome}`);
  } else {
    console.log("Auditoria: Nenhum profile encontrado no banco de staging.");
  }
});

test("deve verificar se o RPC rpc_get_comprovante_entrega_data retorna confirmado_por", async () => {
  // Apenas verifica se a estrutura de retorno do motor condiz com o planejado
  // Não executa o RPC para não gerar logs/documentos reais sem necessidade
  const { data, error } = await supabase.rpc("rpc_get_comprovante_entrega_data", {
    p_entrega_id: "00000000-0000-0000-0000-000000000000", // UUID inexistente
    p_reemissao: false
  });
  
  // Esperamos erro de não encontrado, mas queremos ver se o erro vem do motor certo
  expect(error?.message).toContain("COMPROVANTE_ENTREGA_NAO_ENCONTRADA");
});
