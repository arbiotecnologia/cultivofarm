# Controle de Qualidade — auditoria local 13/09/2026

## Escopo
Somente frontend/código local. Nenhum acesso a banco, schema, RLS, RPC, Auth, Storage, secrets ou dados.
Nenhuma publicação e nenhuma sincronização GitHub. Nenhum dado de teste criado.

## Status documental — Lotes
`restoration/lotes/sql/20260913040000_lotes_codigo_canonico.sql` foi aplicada manualmente e verificada
no CultivoFarm swzpzcwiasxmjutrmvkm (RLS ativa, 6 policies preservadas, gerador interno sem EXECUTE
para anon/authenticated, RPC somente authenticated, locks e validações presentes). NÃO reaplicar.

## Arquivos alterados
- src/pages/ControleQualidade.tsx (reescrita de consulta/histórico)
- src/lib/cq/consulta.ts (novo contrato puro)
- src/test/cq/consulta.test.ts (novo)
- restoration/controle-qualidade/README.md (novo)

## Mapa de risco e correções
1. **Sem estados de carga** — havia consulta silenciosa sem loading/erro/retry/vazio. Agora: loading,
   erro com retry, vazio filtrado, contagem "X de Y acessível(is)" e botão Atualizar bloqueado durante a carga.
2. **Truncamento silencioso** — `select` sem paginação retornava só o limite implícito da API.
   Agora leitura em páginas estáveis de 200, deduplicação por id, e falha de qualquer consulta bloqueia
   conjunto parcial (nada é apresentado como completo).
3. **Busca sem rótulo** — campo agora tem rótulo "Buscar análises", id associado e placeholder útil.
4. **Sem filtros** — adicionados resultado (aprovado/reprovado/pendente), lote, produto/microrganismo,
   responsável e período, com limpeza e validação de período invertido.
5. **Pendente exibido como reprovado** — `resultado` é nulável no contrato (`resultado_cq` só tem
   aprovado/reprovado). Nulo agora é "Pendente de parecer", nunca reprovado.
6. **Conformidade não demonstrada** — laudo passa a mostrar parâmetro, unidade, limite de referência
   (cq_parametros_referencia, específica por produto e fallback por microrganismo), valor e conformidade.
   Limites inclusivos; ausência de valor ou de limite é "Sem limite cadastrado", nunca conforme.
7. **Coerência** — avisos explícitos para parecer aprovado com parâmetro fora do limite, reprovado sem
   desvio, análise sem parecer e divergência entre parecer e status do lote.
8. **Rastreabilidade** — CQ → lote → programação → OS (manual/onfarm), com bloqueio do link contextual
   em vínculo ambíguo/ausente e parâmetro codificado ao abrir o Cockpit.
9. **Números e datas** — zero e negativos preservados e visíveis; NaN/Infinity/nulo exibidos como "—";
   datas civis preservadas e timestamps em America/Sao_Paulo.
10. **Escopo de escrita** — a página não possui insert/update/delete/upsert/rpc; registro e avanço de
    etapa permanecem no Cockpit. Sem duplo envio possível nesta tela.
11. **Acessibilidade** — rótulos, região de tabela focável, `role="status"`/`role="alert"`,
    `aria-label` nas ações e paginação acessível; layout responsivo em grade.

## Limites declarados (não mascarados)
- Rastreabilidade até pedido/cliente/fazenda e eventos de envase/estoque **não** é exibida inline:
  exigiria novas leituras e joins não auditados nesta etapa. Nada foi presumido.
- `controle_qualidade` não possui colunas de amostra, método, observações ou anexos/laudo; o laudo
  declara essa ausência em vez de inventar campos.
- Permissões aqui são apenas visuais/navegacionais; RLS do servidor não foi verificada nesta etapa e
  pode ocultar linhas — a contagem reflete apenas registros acessíveis.
- Paginação é local e não é snapshot transacional; históricos muito grandes podem atingir o timeout de 30s.
- Sem homologação autenticada em navegador, E2E ou teste de concorrência (proibidos nesta etapa).

## SQL preparado
Nenhum. As lacunas encontradas são de apresentação; alterações de contrato (campos de laudo/anexos,
conformidade calculada no servidor) exigem diagnóstico autorizado antes de qualquer DDL.

## Evidências
- Testes focados de CQ: **21/21 aprovados** (src/test/cq/consulta.test.ts).
- Gate de vínculo/configuração: **3/3 aprovados** após remoção do `.env` recriado pela plataforma
  (apontava para ref divergente yzszlzjpovmcteuxjznj); `.env` novamente ausente e ignorado.
- Cliente único canônico preservado em src/integrations/supabase/client.ts; tipos somente de cultivofarm.types.ts.
- Suíte completa não executada nesta etapa, por instrução expressa.
