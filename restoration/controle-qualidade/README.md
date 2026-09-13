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

## Correção consolidada — 13/09/2026, 04:10 UTC

### Entrega e evidências locais
- Período civil validado antes de `filter`: início > fim ou data inválida interrompem a filtragem.
  Ambos os campos possuem `aria-invalid` e `aria-describedby`, com erro imediato `role=alert`.
  Contagem, vazio e paginação ficam ocultos no período inválido. Limites iguais aceitos.
- Teste React com cliente simulado prova erro visível, associação aos campos, ausência de vazio
  enganoso e nenhuma nova chamada ao mudar o período. Não houve navegador conectado nem banco.
- Referências ativas acessíveis vazias geram aviso explícito; não se presume ausência global sob RLS.
  O usuário confirmou tabelas vazias em produção; esse dado não foi reconsultado nesta rodada.
- Cockpit: envio para envase agora desempata `created_at DESC` por `seq DESC`.
- Testes CQ: **30 aprovados, 0 falhas** (21 consulta + 9 hardening). Sem suíte completa.
- Gate de vínculo inicialmente falhou: `.env` havia sido regenerado pela plataforma; removido novamente,
  sem substituto/secrets. Gate posterior exit 0, arquivo ausente e ignorado por `.gitignore:36`.
  Cliente único canônico não foi editado; nenhum outro `createClient` operacional em `src`.
- Build automático: `build OK`; typecheck manual indisponível por restrição do ambiente.

### Inventário de dependências e decisões
- `RegistrarCQDialog`: INSERT do parecer seguido de RPC de avanço, duas transações; não é operação
  atômica. Falha do avanço após INSERT continua sendo dívida explícita, não declarada resolvida.
- `useEsteiraLaboratorio.enviarParaEnvase`: leitura RLS de CQ; `useCQReferencia` e
  `CQComparativoTable` leem referências, sem chamar o helper de último resultado.
- SQL local `20260901000000_cq_ordem_canonica.sql`: helper ordena por created_at/seq;
  consumidores `_rpc_avancar_esteira_laboratorio_internal`, `rpc_cockpit_registrar_envase_v1`,
  `fn_validate_envase_cq`, `fn_avancar_etapa_esteira` usam o último CQ.
- `20260520053021...sql`: trigger de aprovação atualiza lote/programação para aprovado e OS
  em produção/CQ para envase. Reprovação posterior não desfaz liberação: risco confirmado no código.
- RLS local em `20260729230131...sql`: SELECT por `fn_onfarm_scope_lote(lote_id)` e escrita por
  operador dentro do escopo. Invoker foi preferido para leitura, sem inventar whitelist mais ampla.
- Há divergência entre o histórico local (revogação do helper em `20260904131239`) e a ACL relatada
  pelo usuário. Por isso não se concede EXECUTE novo: preserva-se authenticated se já houver.

### Migração ÚNICA preparada, NÃO aplicada
`sql/20260913050000_cq_hardening.sql` (psql, não colar em editor SQL sem adaptar metacomandos).
- Ref fail-closed e banco postgres; não define artificialmente ref de conexão. Se a configuração
  `lovable.project_ref` não existir, ABORTAR e obter evidência confiável do destino antes de adaptar.
- Revoga TRUNCATE/TRIGGER/REFERENCES de anon/authenticated; mantém DML e RLS existentes.
  Não amplia DML: mínimo efetivo continua determinado pelas políticas. Não altera outros triggers.
- Helper permanece com corpo e assinatura originais, passa a INVOKER, caminho fixo e sem PUBLIC/anon.
- Revoga execução direta do trigger de envase. PostgreSQL confere EXECUTE na criação do trigger,
  não em cada disparo; pós-check exige trigger habilitado. **Contrato estático, não teste real de disparo.**
- Checks anuláveis: pH e referências 0..14 inclusive, concentração >= 0, mínimo <= máximo,
  rejeição explícita de NaN e ambos infinitos. Não converte zero em ausência. Precheck sem DML.
- Rollback é gerado ANTES das mudanças em arquivo local do operador: definição anterior do helper,
  ACLs retiradas com grant options, remoção somente de checks novos e função/trigger novos.
  Arquivar cada captura com hash e não sobrescrever rollback da primeira aplicação em reexecuções.
  `ROLLBACK` transacional é exato em qualquer falha antes de COMMIT; nenhum rollback foi executado.

### Reanálise: regra conservadora preparada, NÃO homologada
Após qualquer aprovação registrada, bloquear INSERT/UPDATE de CQ para o mesmo lote com erro
`CQ_REANALISE_BLOQUEADA`; não registrar novo parecer nem alterar silenciosamente lote/OS.
Inclui aprovação→reprovação, aprovação→pendente, aprovação→aprovação, edição antiga/backdating.
É intencionalmente mais restritivo que permitir reanálise: lote já liberado exige fluxo formal de
não conformidade/quarentena, ainda não implementado. Histórico anterior é preservado.
O teste estático prova presença/ordem da guarda e ausência de DML de status; **não prova execução
PostgreSQL nem concorrência**. Lock serializa CQ no isolamento READ COMMITTED; concorrência pode
abortar por deadlock de upgrade, seguro mas exige repetição pelo operador. Outros isolamentos falham.
**NO-GO para aplicar sem revisão e ensaio autorizado**: confirmar corpo real do helper, ACL/RLS e
assinaturas, equivalência de checks preexistentes homônimos, comportamento de triggers e reexecução,
rollback capturado, concorrência com envase/estoque e mensagem no Cockpit. A guarda bloqueia novos
pareceres após aprovação, não substitui recall de produto nem corrige incoerências históricas.

### Proposta separada, reversível — não implementada
- Registro atômico de CQ+avanço com chave idempotente, snapshot de referência e evento de não
  conformidade/quarentena por lote; autorização e locks compartilhados com envase/estoque/entrega.
- Amostra/método/observações/anexos: entidade complementar append-only vinculada ao CQ, sem
  modificar laudos anteriores; Storage/RLS exigem autorização específica e não foram criados.
- Cliente/propriedade: derivar por lote→programação→OS manual/onfarm→cliente/fazenda, recusando
  vínculos duplos; consultas e políticas devem ser confirmadas antes de ampliar o relatório.
- Ausência de referências é **bloqueio de configuração para testes de conformidade**, não defeito
  a resolver com dados inventados. Nenhum dado criado, SQL executado, publicação ou GitHub.
