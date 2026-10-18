# F2-B1 — ator, alvo e revogação — relatório técnico — 18/10/2026

**Somente leitura em produção `swzpzcwiasxmjutrmvkm`; candidatas/testes fora das pastas automáticas. Nenhum DDL/DML hosted, alteração das 29 policies, deploy/publicação, mudanças de dados, Auth, roles ou frontend.** Ref conferido no config e binding da ferramenta. DDL/DML apenas em PostgreSQL local descartável, conforme autorização.

## 1. Resultado por recorte

| Recorte | Status | Motivo |
|---|---|---|
| Inventário atual | PASS de coleta delimitada | 31 funções com referência lexical direta, seis policies diretas, 29 por helpers; runtime React/Edge mapeado |
| B1a atribuição/edição/revogação | **NO-GO específico** | Writer canônico fechado; PUC tem containment false; trigger não autoriza ator; sync deixa resíduos se tipo/role mudarem |
| B1b contexto comercial | PASS preparação/regressão local; **NO-GO hosted** | Preserva owner e legado válido, bloqueia vínculo revogado/tenant divergente; dependência legacy ainda conta histórico |
| Revogação global | **NO-GO** | Financeiro, carteira técnica, policies diretas, Storage e caches possuem caminhos independentes |
| RLS/JWT/portal real | **Não realizado** | Nenhum login, mudança de vínculo real ou pré-prova hosted neste turno |

Não há aprovação de implantação. Arquivo B1a é **gate de recusa e desenho**, não migration funcional disfarçada. B1b contém body candidato, mas tem parada incondicional no preflight; remover barreira requer nova revisão, não flag/GUC.

## 2. Fatos novos versus relatório anterior

SELECT próprio confirmou **1 vínculo não revogado, 0 atribuições ativas PUC, 0 PTC**. Zero atribuições não prova segurança futura nem autoriza reabrir canal.

**Correção importante:** `partner_user_clients` tem policy **RESTRICTIVE ALL** `bf02_assignment_contract_containment`, `qual=false`, `with_check=false` para anon/authenticated. Portanto ORs permissivos de admin/gestor/técnico NÃO tornam PUC acessível diretamente aos clientes atuais. O relatório F2-B anterior não mencionou essa contenção: não se deve inferir bypass PUC apenas pelas policies permissivas.

`partner_technician_clients` não tem essa mesma contenção na coleta: três policies permissivas, trigger de updated_at apenas. Ambas tabelas têm RLS e grants amplos; serviço/DEFINER não são contidos por false da mesma maneira. `assign_b2b_user_client_secure` permanece fechado e só postgres/service_role têm EXECUTE no snapshot. Nenhum canal reaberto.

`validate_partner_user_client_fn` BEFORE INSERT/UPDATE valida alvo e carteira, **não auth.uid()**. `sync_puc_to_ptc_fn` AFTER INSERT/UPDATE só sincroniza se NEW.assignment_type=tecnico e role compatível; ao alterar tipo/role, pode deixar PTC antigo ativo. Não deletar histórico nem tornar revogação sinônimo de compensação de provisionamento.

## 3. Separação de responsabilidades: proposta, não regra aplicada

### Ator

- Origem única `auth.uid()` e prontidão/tenant via contratos canônicos; parâmetro target nunca vira identidade do ator.
- Fluxo interno: reutilizar `b2b_internal_commercial_actor()` (admin/gestor_comercial ativos, tenant derivado, sem B2B misto), com partner owner e cliente daquele tenant. Não ampliar superadmin por role isolada.
- Fluxo gestor B2B: contexto canônico prova parceiro e modo; se contexto `legacy_partner_tenant`, organização do ator permanece tenant legado, owner permanece tenant comercial do parceiro. **Não atribuir poder de gerenciar alvos do owner ao tenant legado por mera ligação ao parceiro.** Mandato de gestão legado não foi provado: NO-GO desse writer.
- Revalidar depois de locks e no replay; CAS/version, idempotência ator/tenant/payload, auditoria imutável/motivo. Sem ticket/GUC inventado, sem liberar helpers por current_user=postgres.

### Alvo

- Core de elegibilidade por user/par: vínculo não revogado/vigente, tenant derivado igual ao owner, parceiro ativo/não deletado, perfil pronto e papel coerente.
- Perfil do alvo no owner é contrato existente de `b2b_assignment_identity_coherent`, **específico da carteira interna**, não universal para todo portal B2B.
- Alvo legado pode ter contexto válido de portal; isso NÃO prova elegibilidade à carteira gerida por tenant comercial. Não resolver chamada de alvo invocando contexto self do ator, nem trocar claims para personificá-lo.
- Core não concede permissão de executar ação; manter fechado ao cliente ou wrapper autorizado. Helpers por par atuais permanecem sem alteração, porque usam target de terceiros e têm EXECUTE cliente. Publicá-los como introspecção arbitrária não é solução.

### Operações

| Operação | Provar ator | Provar alvo | Preservação/locks |
|---|---|---|---|
| Criar/reativar atribuição | Gestão no tenant/par/cliente exatos | Elegível vigente, papel/tipo compatível | Locks ordenados, CAS, audit, sem transferir carteira |
| Editar atribuição ativa | Mesmo escopo e geração | Elegível para capacidades novas | user/par/cliente imutáveis, sem troca lateral |
| Desativar atribuição antiga | Gestão do registro original comprovada | NÃO exigir alvo atualmente elegível | Só active true→false, identidade e capacidades imutáveis, audit; desativar PTC antigo independentemente da role atual |
| Revogar vínculo B2B | Contrato próprio autorizado | Identificar exatamente vínculo/version | Fechar leitores na mesma transação; preservar Auth/histórico e outros vínculos/roles |
| Ler elegibilidade de alvo | Somente writer/reader autorizado | Avaliação por par/tenant | Resultado não é permissão do ator |

Mudar user_roles não é requisito de revogar vínculo. Havendo outro vínculo ativo, não retirar role B2B. Atual UNIQUE limita recorrência; não removida nesta fase.

## 4. Matriz de impacto / aceite futuro

| Caso | Portal/contexto | Writer/carteira | Estado desta rodada |
|---|---|---|---|
| Gestor commercial_owner A, par A | Manter vigente | Só alvo/cliente A por contrato | Contexto local passa; writer não provado |
| Gestor A → técnico alvo diferente, mesmo tenant/par | Não trocar ator | Elegibilidade do alvo não autoriza sozinha | Baseline reproduz alvo distinto; NO-GO autorização real |
| Admin B → alvo/par/cliente A | Nenhum B2B implícito | Negar cross-tenant | Baseline trigger sozinho aceita em teste privilegiado; isso demonstra falta de autorização no trigger, não bypass RLS hosted |
| Legado L com organizations.partner_account_id=par A | Preservar modo legado e tenant L | Não conceder mandato sobre owner A por inferência | Contexto SQL local válido; gestão bloqueada |
| Legado com parceiro errado/inativo/sem entitlement | NULL | Negar | Negativas locais passam |
| Alvo revogado/inativo | Não autoriza futuro acesso | Cleanup precisa continuar possível a ator autorizado | Baseline ignora revogado; inativo bloqueia cleanup, conflito reproduzido |
| Técnico | Contexto técnico, sem finanças implícitas | Só escopo expresso | Contexto local; branches PTC e financeiro não certificadas |
| Produtor/interno/superadmin | Nenhum parceiro implícito | Não elevar por parâmetro | Admin/superadmin context NULL local; matriz real pendente |
| Zero/2+ vínculos | NULL | Sem seleção aleatória | 2+ local; zero/no actor; UNIQUE só removida localmente |
| Financeiro/fiscal/Storage | Tenant e parceiro comprovados | Sem ações fiscais/cobranças externas | Somente inventário; real pendente, serviços OFF |

## 5. Revogação: alcance real e limites

Inventário enumerado com assinaturas/hash e fontes: `vinculos-b2b-f2b1-inventario-20261018.review.md`.

- Contexto/projeção lê vínculo direto. B1b acrescenta revoked_at/valid_from/tenant=owner **sem exigir profile.org=owner**; preserva lógica owner/legacy, papel exclusivo, entitlement, parceiro e organização ativos.
- `b2b_actor_scope` legado ainda conta todas as linhas. Com um vigente + histórico revogado, contexto legado continua NULL pelo guard antigo: reproduzido localmente. **Bloqueador adicional para multi-vínculo/recorrência**, não ajustar expectativa para alegar suporte. B1b não altera esse helper nem libera cutover.
- `can_user_access_cliente(uuid,uuid)` contém branch gestor que junta partner_users sem revoked_at e técnico por PUC OU PTC; admin/gestor interno retorna true antes disso. Parâmetro user_id é alvo, não autoriza impersonation. Alterar self-only quebraria callers legítimos; contrato completo desses callers fica próximo recorte.
- Um argumento tem outros caminhos. Storage `cliente_storage_object_permitted` chama **um argumento** e exige path/cliente no tenant; não generalizar defeito de outro overload automaticamente.
- Storage tem 33 policies, 18 com palavras partner/cliente/arquivo. Policy permissiva de upload logo lê partner_users; três RESTRICTIVE de logos usam `b2b_partner_logo_write_allowed` → contexto. Em B2B owner, helper nega logo; legado gestor depende contexto. B1b pode fechar esse caminho após revogação, mas upload real/signed URL/TTL não foram testados.
- Seis policies diretas incluem financeiro/timeline e PTC, fora da correção dos 29 helpers. Não alteradas conforme autorização.
- Guard de contenção negativa `b2b_direct_partner_row_allowed` precisa de tratamento especial: filtrar revogados dentro de NOT EXISTS pode **liberar** fallback antes bloqueado. Não aplicar troca lexical global.
- Cache mesmo ator não inclui versão de vínculo e gate authz permanece false. Não afirmar limpeza automática, cross-device ou recuperação de bytes já baixados. Sem UI alterada.

## 6. Artefatos e preflight

Novos arquivos `docs/auditorias/vinculos-b2b-f2b1-*`:

- `baseline-20261018.sql`: definições live de contexto, scope, guard legado, identidade de alvo, trigger de validação, sync, projeção e overload de cliente. Quatro helpers originais permanecem no baseline F2-B anterior. Não executar baseline como installer.
- `preflight-readonly-20261018.sql`: catálogo completo SELECT-only, policies/ACL/triggers e contagens, sem PII.
- `b1a-migracao-20261018.sql`: **NO-GO**, checks de trigger/sync e containment, erro deliberado antes de qualquer DDL; desenho de writer em comentários. Nenhuma migration funcional inventada por contrato não provado; rollback B1a é nada a desfazer.
- `b1b-migracao-20261018.sql`: substituição proposta de **um** helper, assinatura/DEFINER/owner/ACL intactos. Checks bodies/dependências, overloads, search_path/ACL, UNIQUE, linhas atuais, atribuições e digest das 29 policies (inclui roles/comando/permissive). Parada incondicional até proof/review; nenhum flag/GUC libera.
- `b1b-rollback-20261018.sql`: body e metadata/ACL da candidata verificados, restaura contexto exato sem dados/ACL novos. Reintroduz lacuna; exige contenção/decisão, nunca automático.
- Este relatório e inventário: matriz/gates/evidências.

Não combinar com candidata escalar owner-only anterior: ela não preserva legado como universal; permanece NO-GO e não foi instalada.

## 7. Evidência de testes efetivamente executados

Comando: `bun run test -- src/test/saas/b2b-f2b1-context-postgres.test.ts src/test/saas/b2b-f2b-helpers-postgres.test.ts`.

Resultado final às 17:57 UTC: **2 arquivos / 2 testes passaram**, PostgreSQL 17.9 descartável por socket local. Novo harness `scripts/tests/b2b-f2b1-context-local.py`: **35 asserts SQL**, rollback por hash exato; anterior **26 asserts / 2 hashes**. Não comparar “35” com 35 logins ou políticas reais.

Novo teste executa bodies reais baseline/candidata; Auth, h15, role e entitlements são dependências sintéticas claramente identificadas, **não mocks para obter homologação**. Baseline de scope/guard/projeção/trigger e helpers por par é SQL real capturado. Preflight B1a recusa containment ausente; B1b recusa manifest das 29 ausente no schema local. Não foi provada instalação integral do preflight contra todas policies hospedadas.

Asserts cobrem owner/projeção, revogado, vigência, tenant NULL/divergente, legado válido e tenant legado preservado, parceiro errado/inativo/deletado, perfil inativo/provisório, entitlement, papel técnico/mismatch, 2+, histórico e bloqueio persistente do scope legado, roles mistas, tenant estrangeiro, ator distinto de alvo, elegibilidade de alvo não sendo autoridade do ator, defeitos baseline de revogado/cleanup inativo, admin/superadmin/no actor/anon ACL. A rodada final também executou sync real: criação de PTC, resíduo ativo após mudança de assignment_type e overload de cliente autorizando alvo técnico revogado foram reproduzidos no schema descartável. São testes do defeito baseline, não correções instaladas nem exploração com sessão real.

Falhas iniciais corrigidas: search_path dos doubles locais; expectativa de histórico legado falhou por dependência real e virou **teste do bloqueador**, não alegação de suporte. Exceptions aceitas apenas no erro esperado, com flag que exige rejeição; nenhuma exceção genérica conta PASS.

**Não realizados:** DDL/DML/pre-prova hosted, login/logout/MFA/JWT, RLS real A/B, writer autorizado de terceiros, cleanup real, concorrência/idempotência hosted, Storage autenticado/TTL, financeiro/fiscal reais, portal/cache após revogação. Build automático observado OK em `/tmp/observability/build-errors.log`; typecheck separado sem evidência nesta rodada, portanto não declarado PASS. Lint focado executado: `bunx eslint src/test/saas/b2b-f2b1-context-postgres.test.ts`, exit 0; lint global não certificado, sem PASS global de aplicação.

## 8. Próximo recorte seguro

1. Auditar writer interno de atribuições e todos callers do overload de cliente com alvo: provar ator/tenant antes do alvo; manter containment e RPC fechados enquanto faltar contrato.
2. Definir cleanup atômico PUC/PTC sem exigir elegibilidade atual do alvo, sem trocar identidades/tipo e sem transferir registros.
3. Revisar **b2b_actor_scope legado isoladamente**, incluindo resultado para nenhum/um/múltiplos vínculos e histórico, sem ampliar modo legacy ou branch interna. Nova candidata conjunta contexto/scope precisa manter guards/ACL e provas owner/legacy.
4. Executar matriz real em homolog fiel com identidades autorizadas; revisão independente, backup/ata e nova autorização para subfase instalável.
5. Só com readers/policies/cache fechados avaliar UI de revogação e gestão; **F2-B1 permanece NO-GO de execução**.
