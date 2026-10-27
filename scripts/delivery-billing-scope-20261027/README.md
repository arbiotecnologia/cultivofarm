# Cobrança na entrega — escopo por empresa (candidato INATIVO, 27/10/2026)

Nada aplicado em produção, nada publicado. Fontes capturadas somente leitura do ref `swzpzcwiasxmjutrmvkm`.

## Alvos
| Função | md5 LIVE (baseline) | ACL / config |
|---|---|---|
| `fn_generate_receivable_from_entrega(uuid,jsonb)` | `670ea34d37c4c4fd6612031ad763a3a7` | postgres/service_role/authenticated X; `search_path=public` |
| `fn_mark_entrega_not_billable(uuid,text)` | `e4008b029ce8d58f70f3fc88571d03be` | idem |

Dependências pinadas (não alteradas): `is_financial_staff` `6e8f2fa7…`, `fn_authz_uid_scope_ok` `00a9a4d4…`, `h15_user_organization` `ff3688c3…`, `fn_entrega_valor_faturavel_v1` `5ac43dc1…`, `fn_entrega_guard_faturamento_v1` `fe0d6a0f…`, chamador `fn_entrega_confirmar_engine_v1` `6eb78cee…`.

## O que o candidato fecha
1. **Empresa:** empresa do ator via `h15_user_organization` (perfil e organização ativos); entrega bloqueada com `organization_id = empresa do ator`. Entrega de outra empresa ou sem empresa = 42501, igual a inexistente. Replay só devolve id dentro da mesma empresa; o ramo `unique_violation` também filtra empresa.
2. **Categoria:** obrigatória, `active` e `type='RECEITA'` (global). Sem fallback.
3. **Forma de pagamento:** obrigatória e ativa. Sem fallback.
4. **Revogação:** gate `cf_user_guards_v1.state` → reautorização → advisory `entrega_faturar:<id>` (mesma chave nas duas funções) → reautorização → lock da linha → reautorização. `lock_timeout=3s`. Sessão nula negada explicitamente nas duas.
5. **Parcelas:** array; quantidade = `installment_count`; números 1..n sem repetição; vencimento não nulo e ≥ emissão; valor > 0 e não NaN; soma = total. Primeiro vencimento ≥ emissão; total NaN recusado.
6. **Conflitos de negócio → PT409:** cancelada, não entregue, NOT_BILLABLE, já faturada (marcar), título ativo existente. Validações de entrada continuam `check_violation`; mensagens antigas preservadas.

Valor canônico, guard de reconciliação, inserts, auditoria e assinatura permanecem iguais.

## Arquivos
- `preflight.sql` — somente leitura, todas as linhas `true` ou abortar.
- `candidate.sql.review` — transação com `lock_timeout 3s`/`statement_timeout 15s`, assert de ACL.
- `postflight.sql` — config/ACL, marcadores do corpo, dependências inalteradas.
- `rollback-containment.sql.review` — **deny-only**: retira EXECUTE de authenticated; nunca restaura os corpos sem escopo. Efeito: tela financeira não fatura até reinstalar corpo corrigido; chamadores postgres/service_role continuam.
- `test-local.py` / `results.txt` — **47/47 checks em PostgreSQL descartável, Auth sintética, schema reduzido e stubs**. Não é homologação JWT/RLS real.

Cobertura sintética: positivo, replay (mesmo id, sem nova auditoria), A↔B (faturar, marcar, replay sem vazar id), sem empresa, sem papel, sem sessão, anon, perfil inativo, categoria DESPESA/inativa, forma ausente/inativa, 8 casos de parcelas, 4 PT409 + marcar→faturar, rollback por falha injetada, duas chamadas simultâneas (1 título), revogação commitada durante espera no gate (42501, sem escrita), ordem inversa (faturamento antes, revogação depois), `55P03` com gate preso.

## Riscos residuais / dependências
- **Ordem de locks no motor de confirmação:** `fn_entrega_confirmar_engine_v1` chama `fn_mark_entrega_not_billable`; se já tiver a linha da entrega bloqueada sem o gate, haverá gate depois da linha (inversão). O motor está contido para authenticated hoje; revisar antes de reabri-lo (Etapa 5).
- **Interface:** a tela envia `payment_method_id: null` quando o campo fica vazio e lista categorias `RECEITA`/`AMBOS`. Após a instalação, faturar sem forma de pagamento passa a ser recusado com mensagem clara; tornar o campo obrigatório na tela é melhoria recomendada (não feita). Tipo `AMBOS` não existe hoje no banco (só RECEITA/DESPESA).
- PT409 nas telas aparece como mensagem de erro (`toast`); não há retry automático.
- `is_financial_staff` continua um papel global; o escopo vem da empresa do perfil. Administrador global de outra empresa também fica restrito à própria empresa (mudança intencional).
- Homologação real A/B, revogação real durante espera e efeito em títulos já existentes ficam com o auditor.

Contabilidade real e SU-518022 pendentes.
