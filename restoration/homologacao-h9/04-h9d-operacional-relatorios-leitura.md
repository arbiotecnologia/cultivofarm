# H9-D — Auditoria de funções operacionais, relatórios e exposições de leitura

**Ambiente:** homologação `ikaauvsflpmamgxmkhoq` (exclusivo).
**Produção `navfzbwgwzruipouyfnk`:** não acessada, não consultada, não migrada.
**Ledger:** 662 (última `20261006000000`, exatamente uma vez).
**Status desta rodada:** **H9-D CONTINUA — NO-GO para encerramento** (e NO-GO produção).

Esta versão substitui integralmente a redação anterior, que sobrealegava
"376 auditadas / 323 AUTH_COMPROVADA" com evidência genérica derivada de regex.

## 1. Retificação metodológica

1. **Regex e posição de statement são apenas TRIAGEM.** Nenhuma função é
   classificada como segura por padrão nominal, por ocorrência de `auth.uid()`
   ou por posição relativa de guarda.
2. **AUTH_COMPROVADA** exige corpo lido manualmente, com a guarda textual da
   própria assinatura registrada na evidência, incluindo cadeia transitiva
   quando a função delega a helper.
3. **NAO_APLICAVEL** exige corpo lido e ausência comprovada de dado sensível no
   retorno, sem SQL dinâmico controlado pelo chamador.
4. Tudo o mais permanece **PENDENTE_EVIDENCIA**, em lotes determinísticos
   `H9-D-L1..L5` a serem concluídos dentro da própria H9-D.

## 2. Escopo e aritmética

| Conjunto | Qtd |
| --- | --- |
| Universo bruto SECDEF executável por `authenticated` | 376 |
| Fora do escopo profundo — herdadas da H9-C (`03-h9c-secdef-authenticated.md`) | 84 |
| **Escopo profundo H9-D** (186 `PENDENTE_EVIDENCIA_ONDA_POSTERIOR` + 106 `SEM_ESCRITA_NAO_AUDITADA_EM_PROFUNDIDADE`) | **292** |

Classificação do escopo profundo (soma = 292):

| Classificação | Qtd |
| --- | --- |
| AUTH_COMPROVADA (corpo lido, evidência por assinatura) | 153 |
| NAO_APLICAVEL (corpo lido, sem dado sensível) | 4 |
| EXPOSICAO_COMPROVADA_CORRIGIDA (H9-D1) | 1 |
| PENDENTE_EVIDENCIA (lotes H9-D-L1..L5) | 134 |

Além do universo de 376, a homologação passou a expor quatro helpers
`private.h7n_*` (`catalogo_ficha_microrganismos`, `catalogo_ficha_produtos`,
`esteira_laboratorio`, `fluxo_visita_tecnica`), executáveis por `authenticated`.
Os quatro foram lidos: **todos filtram internamente por papel e por tenant**
(`has_role`, `consultor_id = auth.uid()`, `get_cliente_ids_for_user(auth.uid())`).
Eles não integram a contagem das 292 e ficam registrados para reconciliação
formal do universo na próxima rodada.

## 3. Exposição comprovada e corrigida (H9-D1)

`public.fn_run_recurring_generation()` permitia que qualquer `authenticated`
sem perfil financeiro enumerasse templates ativos e gravasse em
`recurring_generation_log` e `financial_audit_log`. Correção aplicada em
`20261006000000_h9d1_authz_recurring_generation_v1.sql`
(`restoration/homologacao-h9/h9d-forwards/`, rollback em `h9d-rollbacks/`):
guarda `is_financial_staff(auth.uid())` com `42501`, preservando a execução
interna do cron (sem JWT). **Preservada nesta retificação — nenhum DDL novo.**

## 4. Verificações desta rodada (somente leitura)

- Cadeia BI de visitas: `rpc_bi_visitas_por_cliente/consultor/fazenda/talhao`
  leem `vw_fluxo_visita_tecnica`, que é `security_invoker=true` e delega a
  `private.h7n_fluxo_visita_tecnica()`, cujo filtro exige papel interno ou
  vínculo do consultor/cliente. Teste em transação revertida, com usuário
  `authenticated` sem papel: **0 linhas** em todas as chamadas. Sem BOLA.
- Cadeia de entrega: `rpc_cockpit_confirmar_entrega_v1` e
  `rpc_entrega_confirmar_v1` delegam a `fn_entrega_confirmar_engine_v1`, que
  exige `auth.uid()` e `fn_entrega_assert_confirmador` (papéis internos, com
  `operador_onfarm` restrito à origem `onfarm`).
- Validações públicas (`rpc_validar_comprovante_entrega`,
  `rpc_validar_rastreio_produto`): rate-limit antes de qualquer leitura/escrita
  e retorno sem PII — comportamento da H9-B preservado.
- Funções sem qualquer referência de autorização no corpo: **16**, todas lidas
  individualmente. Nenhuma delas escreve dado sensível sem cadeia guardada;
  seis permanecem PENDENTE por decisão de least-privilege
  (`fn_catalogo_preco_canonico`, `fn_fiscal_company_crt`,
  `fn_microorganism_regulatory_facts`, `fn_onfarm_scope_lote`,
  `get_cliente_id_for_user`, `get_cliente_ids_for_user`).
- Nenhuma fixture sintética criada; todos os testes rodaram em transação
  revertida. Nenhum dado real, DSN, token ou segredo foi exibido.

## 5. Decisão

- **Nova vulnerabilidade comprovada nesta rodada:** nenhuma.
- **Alteração no banco nesta rodada:** nenhuma (ledger permanece 662).
- **H9-D:** CONTINUA. Encerramento condicionado à evidência específica das 134
  funções pendentes (lotes `H9-D-L1..L5`) e à reconciliação dos quatro helpers
  `private.h7n_*`.
- **Produção:** NO-GO.
- **H9-E:** não iniciada.

## 6. Artefatos

- `h9d-inventario/secdef-authenticated-inventory-h9d.tsv` — 376 linhas, com
  colunas `escopo_h9d`, `classificacao_h9d` e `evidencia` por assinatura.
- `h9d-inventario/classificacao-h9d.tsv` — visão reduzida.
- `h9d-inventario/resumo-h9d.json` — aritmética 376 = 84 + 292.
- `h9d-inventario/gerar-inventario-h9d.py` — gerador; rotula regex como triagem.
- `src/test/security/h9d-inventario.static.test.ts` — gate estático que rejeita
  evidência genérica e exige o fechamento 84 + 292.
