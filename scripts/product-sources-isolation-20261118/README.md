# Isolamento de referências manuais de produto

## Achado e recorte
Root relatou HML: B obtém id de fonte de produto QA A; cultures/targets invisíveis, evidence reader B403. Políticas de fonte históricas por papel não provam propriedade. Isso não é conflito CAS: root confirmou edição/rejeição stale ao preservar datas como strings. Instalador evidence 072/dc7 aplicado somente HML com PRE/POST integral foi reportado; nenhum byte/pin desse pacote é alterado aqui.

## Delta aditivo inativo
Quatro políticas RESTRICTIVE adicionais na tabela existente. SELECT de `entidade_tipo='produto'` requer `recorte_a_actor_fresh('read_catalog')`, pai existente com owner igual ao tenant atual e segunda autoridade fresh antes de retorno. NULL owner/órfão/anon/inativo/feature/papel revogado negam. Demais entidades passam pelo novo predicado sem mudança e continuam submetidas às políticas existentes: não ganham nenhum novo acesso. SELECT tem helper público de booleano, SECURITY DEFINER/search_path fixo, sem dados nem exceção de autorização exposta. EXECUTE anon somente para produzir false sob políticas PUBLIC; private actor continua sem EXECUTE client.

INSERT/UPDATE/DELETE diretos de produto ficam fechados, inclusive A: sem writes fora do motor canônico. UPDATE fecha tanto linha produto anterior quanto transformação de outra entidade em produto. Não revoga DML da tabela inteira, não remove grants/políticas globais e não altera qualquer writer. O proprietário/BYPASSRLS permanece privilegiado; motor postgres-owned é preservado, não certificado somente por essas políticas. Outros owners sem BYPASS/FORCE RLS precisam ser verificados pelo root antes de instalação. Não há novo gate de evidência: fontes manuais não são o reader privado de evidence, e usam feature read_catalog canônica.

## Assembly root-local
`delta.sql.review` é fragmento NÃO instalável sozinho. Root executa `catalog.sql.review` no seu espelho local PRE, aplica fragmento em transação descartável e gera POST esperado normalizado. Encapsula cada resultado como `{ "ref":"REF_EXATO", "provenance":"root-local-exact-catalog", "catalog": RESULTADO }`. Nenhum arquivo/captura deve ser transferido ao agente.

`python3 assemble.py --ref REF_EXATO --pre PRE.json --post POST.json --fresh-md5 HASH_EXATO --output /tmp/install.sql.review`

Somente HML `vrlcdwmlytukrjezrrnf` ou produção canônica `swzpzcwiasxmjutrmvkm` explícitas; não executado em nenhuma. Builder valida RLS já ligada, fresh VOLATILE/DEFINER/hash, tabelas/ACL/colunas/triggers/índices e políticas antigas inalterados, quatro políticas novas restrictive PUBLIC e publications intactas. Artefato tem lock das tabelas antes de PRE e POST integral na mesma transação; drift/rerun abortam. SQL não pode comprovar ref do projeto: executor root exige preflight independente, nunca inferir ambiente de URL/GUC. POST esperado é input revisado root, não produzido como captura hosted pelo agente. Nenhuma repinagem automática.

## Grants e realtime: prova necessária root
Captura registra table ACL, column ACL, owners, RLS/FORCE, replica identity, triggers, publications e autoridade. Auditar privilégios efetivos/inherited de PUBLIC/anon/authenticated/service_role, especialmente TRUNCATE/TRIGGER/REFERENCES (RLS não protege). Não ampliar nem restaurar grants históricos; drift destrutivo requer closure separado revisado. Não criar/alterar publicação Realtime aqui.

Auth A/B/anon: SELECT id e projeção completa/lista/filtro por produto, leituras do pai e refs em outra empresa; insert/update/delete diretos fechados em A/B/anon; mover entidade micro→produto fechado, fonte micro/global conserva comportamento autorizado original. CRUD canônico A com fontes deve continuar por motor fresh/CAS/recibo instalado; B/revogação/pai órfão negados; provar reads e writes reais, sem claims SQL como evidência JWT.

Se tabela publicada: sessões Realtime A/B reais, INSERT/UPDATE de fonte A pelo motor e revogação/renovação; B não recebe payload e A só recebe autorizado. DELETE Realtime tem limitações próprias de RLS/replica identity e pode transmitir chave histórica: NÃO certificar isolamento HTTP como prova DELETE/realtime. Se esse canal não puder preservar isolamento, preparar contenção específica revisada (não despublicar globalmente agora, preserva outras entidades). Auth/Realtime não executados neste agente.

## Rollback seguro
Não remover as políticas para retornar ao vazamento. Root monta rollback pinado PRE/POST substituindo somente helper por boolean false, mantendo nome do parâmetro `p_product`, VOLATILE/DEFINER, ACL e quatro políticas. Isso fecha apenas reads produto e preserva fontes/histórico/outros tipos, writes diretos permanecem fechados. Corpo de rollback exercitado em PG descartável; rollback final requer pins do POST instalado root e não é gerado a partir de suposição.

## Evidências
39 checks PostgreSQL PASS, incluindo espera real de lock seguida de revogação de feature, table/column grants sintéticos e política permissiva extra sem bypass; quatro testes assembly PASS e dois Vitest permanentes PASS. RLS/ACL reais HML são achado reportado root, não captura executada aqui.
`test_pg.py` reproduz B SELECT antes do delta, executa assembly positivo exato em PostgreSQL descartável e confirma negativas/positivas/DML/gates/rollback. Autoridade fresh capturada é carregada verbatim; identidade, dependências, schema e política role-only são sintéticos explícitos. Resultados em result.json; nenhum teste é JWT/hosted/realtime. `test_assembly.py` testa binding, envelope incompleto, hash falso e actor STABLE. Sem app/rotas/permissões client/IA HML alterados, produção/publicação/subagentes ou captura externa.