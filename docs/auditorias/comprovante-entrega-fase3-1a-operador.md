# Auditoria de Operador no Comprovante de Entrega - Fase 3.1.A

## Diagnóstico
Atualmente, o comprovante de entrega exibe o identificador técnico (UUID) do usuário que confirmou a entrega no campo "Registrado no sistema por". 

- **Origem**: O UUID vem da coluna `confirmado_por` da tabela `public.entregas` ou campos equivalentes.
- **Estrutura**: O nome amigável está disponível na tabela `public.profiles` (coluna `nome`), relacionada via `user_id`.
- **Motor**: A função `fn_comprovante_entrega_montar_v1` monta o JSON do recebimento mas não faz o JOIN com `profiles`.

## Implementação Planejada
1. **Migration SQL**: Atualizar `fn_comprovante_entrega_montar_v1` para resolver `confirmado_por_nome` via JOIN com `public.profiles`.
2. **Frontend**: Atualizar `src/lib/comprovanteEntregaPdf.ts` para exibir `confirmado_por_nome` no PDF.
3. **Snapshots**: Manter compatibilidade com snapshots antigos que não possuem o campo `confirmado_por_nome` usando fallbacks neutros.

## Status: FASE_3_1A_APTA
Aguardando execução da migration e ajuste no renderer.
