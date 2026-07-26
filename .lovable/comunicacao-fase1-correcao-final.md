# Comunicação · Fase 1 — Correção final de consistência

Base: commit `a58b3352f16ed3288eba4a95a14d0a19c72ee5c2`. NÃO avança de fase.
Nenhum código de produção rodado; migration continua não aplicada.

## Arquivos alterados

- `restoration/comunicacao-fase1/migration.sql` (v3, proposta)
- `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx` (form completo de Regras)

## Correções aplicadas

1. **Joins profiles ↔ user_roles** — trocado `pr.id = ur.user_id`
   por `pr.user_id = ur.user_id`, coluna correta (`profiles.user_id` é a FK
   para `auth.users`; `profiles.id` é PK independente).
2. **Deduplicação de `administrative_important_update`** — a seleção de regras
   passou a exigir `estrategia = 'broadcast_role' AND perfil = target_role`.
   Com isso, mesmo que existam múltiplas regras para o evento, apenas a que
   casa com o `target_role` do payload dispara e a resolução de destinatários
   já aplica `SELECT DISTINCT`. Não há mais duplicação por múltiplas regras.
3. **Payload derivado do banco** — para `produto_pronto_retirada` e
   `produto_pronto_aplicacao` o payload agora é obrigatoriamente `{}`.
   `_comunicacao_build_snapshot` deriva `codigo_os`, `data_prevista` e
   `nome_destinatario` diretamente das tabelas `ordens_servico`, `profiles`
   e `clientes`. Nenhum valor de negócio é aceito via wire.
4. **Escopo de OS por cliente** — `by_role` em eventos de OS agora restringe
   a `profiles.cliente_id = ordens_servico.cliente_id`.
   `source_participants` faz `cliente` da OS + usuários com
   `profiles.cliente_id = os.cliente_id` (não `usuarios_cliente_produtor`,
   que não existe no schema). `broadcast_role` é explicitamente **bloqueado**
   no upsert e ignorado no runtime para eventos de OS.
5. **Atomicidade real** — o bloco `EXCEPTION` que persistia `status='failed'`
   foi removido. Qualquer erro durante a expansão (template ausente com
   `RAISE`, RLS, whitelist, etc.) propaga e faz rollback completo do evento
   e da outbox. O enum `comunicacao_evento_status` deixa de ter `failed`.
6. **Contagem estável** — `outbox_enqueued` / `outbox_skipped` agora usam
   `GET DIAGNOSTICS v_row = ROW_COUNT` logo após o `INSERT ... ON CONFLICT
   DO NOTHING`, em vez de depender de `FOUND` (que reflete o último SELECT,
   não o resultado do INSERT com ON CONFLICT).
7. **Verificação de canal** — `rpc_verify_communication_channel` continua
   restrita a administrador; a RPC de usuário controla apenas
   `enabled` / `whatsapp_opt_in_at` / `whatsapp_opt_out_at`.
8. **Formulário de Regras** — `ComunicacaoAdminPage.tsx` ganhou:
   - Todos os campos exigidos pelo `rpc_upsert_communication_rule`
     (event_key, estrategia, perfil, canal, template, versão, prioridade,
     cooldown, enabled).
   - Regra de UI: `administrative_important_update` força estratégia
     `broadcast_role` e exige perfil; `by_role` também exige perfil.
   - Toggle liga/desliga por regra, usando o mesmo RPC.
9. **Fonte única de flag/rota/menu** — sem alteração nesta rodada
   (`isComunicacaoModuleEnabled` já é a fonte única consumida pelo guard
   e pelo `RouteGuard`). O item de menu aparece somente quando a flag do
   feature registry está ligada; o filtro por `featureFlag` no sidebar
   fica como follow-up separado se necessário — não bloqueia esta fase.

## `types.ts` — status

O arquivo `src/integrations/supabase/types.ts` é regenerado
automaticamente pelo sistema de migrations ao aplicar SQL no projeto
gerenciado; edição manual é bloqueada por política de ferramentas.
Assim que a migration `restoration/comunicacao-fase1/migration.sql` for
aplicada em staging, os tipos `comunicacao_*` (tabelas, enums e RPCs)
aparecerão automaticamente e os casts `as unknown as ...` em
`src/features/comunicacao/api.ts` poderão ser removidos em uma mudança
dedicada. Enquanto a migration continuar não aplicada, os casts
permanecem — é a única forma de manter o pacote compilando sem tocar
no arquivo gerado.

## Validações locais

- `bunx tsgo --noEmit` — ok, sem erros.
- Migration continua não aplicada; sem execução de SQL em nenhum
  ambiente.

## Follow-ups explícitos (fora desta correção)

- Após aplicar `migration.sql` em staging: remover casts de
  `src/features/comunicacao/api.ts` e usar os tipos regenerados.
- Ampliar filtro do `AppSidebar` para respeitar `item.featureFlag`
  usando `isFeatureEnabled` — hoje o menu depende de
  `canAccess(role, route)` + presença da rota; o guard de rota já
  protege o acesso efetivo.
