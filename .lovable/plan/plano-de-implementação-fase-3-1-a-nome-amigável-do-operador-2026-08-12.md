# Plano de Implementação - Fase 3.1.A: Nome Amigável do Operador

Este plano descreve a correção da identificação do usuário interno no Romaneio/Comprovante de Entrega, substituindo UUIDs por nomes legíveis.

## Diagnóstico
- O UUID do operador é armazenado em `public.entregas.confirmado_por` (e campos legados).
- O nome amigável está na tabela `public.profiles.nome`.
- O motor `fn_comprovante_entrega_montar_v1` não realiza a resolução do nome.

## Ações Técnicas

### 1. Banco de Dados (Somente Staging)
- Criar migration `20260904000000_comprovante_operador_nome_v1.sql`.
- Atualizar `fn_comprovante_entrega_montar_v1` para incluir `confirmado_por_nome`.
- Realizar JOIN seguro com `public.profiles`.
- Manter `confirmado_por` (UUID) para auditoria interna.

### 2. Frontend
- Atualizar `src/lib/comprovanteEntregaPdf.ts`.
- Alterar a renderização do campo "Registrado no sistema por" para priorizar `confirmado_por_nome`.
- Garantir fallback neutro ("—") caso o nome não exista (snapshots antigos).

### 3. Validação
- Executar Harness SQL para verificar o novo payload do RPC.
- Atualizar testes Vitest em `src/test/entregas/comprovanteEntregaPdf.test.ts`.
- Verificar integridade do `types.ts` (21.850 linhas).

## Riscos e Mitigações
- **Snapshots Históricos**: Serão preservados. O frontend tratará a ausência do campo `confirmado_por_nome` sem exibir UUID.
- **Performance**: O JOIN em `profiles` é feito por PK/Unique, impacto desprezível.

## Veredito Planejado
FASE_3_1A_APTA
