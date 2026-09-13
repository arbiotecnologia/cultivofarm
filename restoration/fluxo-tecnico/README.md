# Fluxo Técnico (/fluxo-tecnico) — auditoria frontend

Rodada somente frontend. **Nenhuma alteração de banco, migration, RLS, credenciais ou publicação.**
Conexão exclusiva: CultivoFarm `swzpzcwiasxmjutrmvkm`.

## Corrigido no frontend

- `aprovacoes_tecnicas` passou a expor `isLoading/isError/refetch`; KPIs exibem `—` em falha (nunca `0`).
- Removida a query morta `all-registros-dashboard`.
- `select("*")` eliminado em `registros_consultor`, `aprovacoes_tecnicas`, `ordens_servico_onfarm`,
  `registros_consultor_recomendacoes`, `registros_consultor_status_log` e `aplicacoes` (timeline).
- Estados de erro separados de vazio, com "Tentar novamente", inclusive em `ChatRecomendacoesRegistro`
  e `OSFlowTimeline` (falha deixou de ser desenhada como etapa pendente).
- Busca ignora acentos, caixa e espaços (`normalizarBusca`).
- Ações de decisão restritas a `administrador`/`gestor` (`podeDecidirPorPapel`, helper testável);
  mudança/invalidez de papel fecha o diálogo e impede a mutation. **A RLS continua sendo a autoridade.**
- Nenhuma mensagem interna do banco chega à UI (`mensagemAmigavel`).
- `selectedRegistro`, comentário e `actionDialog` são limpos ao fechar a revisão ou trocar de item.
- Imports/constantes/estados mortos removidos (recharts, StatusStepper, parseConduta, parseNotes,
  getClienteLabel, rowClick, PRESSAO_MAP, URGENCIA_MAP, OS_TIMELINE_STEPS, pieColors, chartConfig, useNavigate).
- Avanço de status da OS mantém concorrência otimista (`.eq("status", os.status)`), restrito por papel,
  sem uso de `_avancar_os_status` (função interna, não documentada como API pública).

## Bloqueios de integridade assumidos nesta rodada

1. **Decisão não atômica.** A aprovação gravava em sequência `registros_consultor` →
   `aprovacoes_tecnicas` → `registros_consultor_status_log`. Falha intermediária corrompe o fluxo.
   Não existe RPC pública transacional no contrato atual → decisão **desabilitada** com o aviso
   "Aprovação temporariamente indisponível para proteção da integridade"
   (`RPC_APROVACAO_TRANSACIONAL_DISPONIVEL = false`).
2. **Geração automática de OS.** O laço criava várias `ordens_servico_onfarm` sem transação nem
   idempotência, permitindo criação parcial e duplicação em retry. Removido; a recomendação
   permanece aprovada e **não** é marcada como `convertido_os`
   (`RPC_GERACAO_OS_DISPONIVEL = false`).
3. **Notificação e `portal_solicitacoes`.** Eram promessas ignoradas (`.then()` sem tratamento),
   executadas fora da transação. Removidas do caminho de decisão.

## Requisitos de banco pendentes (NÃO aplicados)

- `rpc_fluxo_decidir_recomendacao_v1(p_registro_id uuid, p_status_atual text, p_decisao text,
  p_comentario text, p_idempotency_key text)` — `SECURITY DEFINER`, `search_path` fixo,
  `EXECUTE` revogado de `PUBLIC`/`anon`, autorização por `has_role(auth.uid(),'administrador'|'gestor')`,
  concorrência otimista por `status_atual`, gravando numa única transação:
  `registros_consultor.status`, `aprovacoes_tecnicas` e `registros_consultor_status_log`.
- `rpc_fluxo_gerar_os_onfarm_v1(p_registro_id uuid, p_idempotency_key text)` — transacional e
  idempotente: cria todas as OS das recomendações ou nenhuma, e só então marca `convertido_os`.
- **Outbox/trigger transacional** para notificação de portal e atualização de `portal_solicitacoes`
  após aprovação, em vez de chamadas sequenciais no cliente.
- Confirmar se `_avancar_os_status` deve ser promovida a API pública segura; enquanto não houver
  contrato documentado, o frontend não a utiliza.

## Verificações desta rodada

- Testes focados `src/test/fluxo-tecnico`: **29 aprovados, 0 falhas**.
- Typecheck (`tsgo --noEmit`): sem erros.
- Build automático: **build OK**.
- Gate de vínculo: **OK — CultivoFarm swzpzcwiasxmjutrmvkm** (`.env` divergente removido novamente).
