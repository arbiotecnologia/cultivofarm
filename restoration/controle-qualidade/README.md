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

## SQL aplicável
O arquivo abaixo contém somente o subconjunto seguro aplicado manualmente, conforme relato do usuário; nenhuma execução nesta rodada.

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

### Alinhamento final — 13/09/2026
**Subconjunto seguro aplicado manualmente e pós-check aprovado**, conforme resultados fornecidos pelo usuário; não reconsultado nesta rodada.
- database=postgres; cq_rows=0; reference_rows=0.
- RLS das duas tabelas continua true; dangerous_grants_remaining=0 para TRUNCATE/TRIGGER/REFERENCES de anon/authenticated.
- fn_cq_ultimo_resultado: SECURITY INVOKER (security_definer=false), anon_execute=false, authenticated_execute=true.
- fn_validate_envase_cq: anon_execute=false, authenticated_execute=false; trigger existente e habilitado=true.
- cq_h5_ph, cq_h5_concentracao e cq_h5_referencia existem, estão validadas e rejeitam NaN/Infinity/-Infinity, faixas inválidas e concentração negativa.
- Frontend de período invertido e limite igual verificado visualmente pelo usuário: funciona.

### Script alinhado ao subconjunto seguro
`sql/20260913050000_cq_hardening.sql` é transacional e compatível com SQL Editor, sem metacomandos psql.
Validação do ref **externa pelo dashboard/URL**: destino exclusivo `swzpzcwiasxmjutrmvkm`; current_database não comprova projeto.
Preserva dados, DML, RLS, policies, corpos das funções e triggers existentes. Revoga apenas ACLs indicadas, fixa invoker/caminho do helper e mantém authenticated (falha se ausente, sem ampliar grants).
CHECKs ausentes são criados; homônimos validados têm definição comparada conservadoramente com o contrato: divergência aborta sem substituir nada. Formatação/tipos não reconhecidos exigem revisão, não correção automática.
Pós-check verifica ACLs, invoker, RLS, trigger habilitado e três constraints validadas, exibindo contagens atuais (não exige tabelas vazias em reexecução).
Falha antes do COMMIT exige ROLLBACK da transação no editor. Não há geração automática de arquivo de rollback; reversão após COMMIT exige captura prévia e autorização específica, sem restaurar privilégios por suposição.

### Reanálise — proposta textual, sem SQL executável
**NO-GO; NÃO aplicada e NÃO homologada.** A função fn_cq_bloquear_reanalise_liberada e o trigger correspondente não são criados pelo script aplicável.
A hipótese de bloquear pareceres após aprovação é somente uma proposta: exige desenhar quarentena/reanálise, não conformidade/recall, autorização, histórico e concorrência com envase/estoque antes de homologar cenários.
**Dívida preservada: atomicidade CQ+avanço.** O INSERT do parecer e a RPC de avanço continuam em duas transações; falha parcial não foi resolvida.
Não homologar aprovação→reprovação, aprovação→pendente ou reanálise concorrente sem esse desenho e ensaios autorizados.

### Proposta separada, reversível — não implementada
- Registro atômico de CQ+avanço com chave idempotente, snapshot de referência e evento de não
  conformidade/quarentena por lote; autorização e locks compartilhados com envase/estoque/entrega.
- Amostra/método/observações/anexos: entidade complementar append-only vinculada ao CQ, sem
  modificar laudos anteriores; Storage/RLS exigem autorização específica e não foram criados.
- Cliente/propriedade: derivar por lote→programação→OS manual/onfarm→cliente/fazenda, recusando
  vínculos duplos; consultas e políticas devem ser confirmadas antes de ampliar o relatório.
- Ausência de referências é **bloqueio de configuração para testes de conformidade**, não defeito
  a resolver com dados inventados. Nenhum dado criado, SQL executado, publicação ou GitHub.
