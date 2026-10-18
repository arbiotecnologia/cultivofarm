# Cultivo Farm — F2-B3.2 revisão independente / B3.3 desenho

## Decisão executiva
**PASS delimitado: revisão estática e semântica PostgreSQL local. NO-GO implantação B3.2, origem/cleanup/cutover e certificação RLS.** Recomenda-se **adiar as duas colunas neutras**: não melhoram produto, revogação, concessão ou UX. B3.3 pode avançar como desenho sem instalá-las; não há implementação funcional autorizada neste turno.

**Novo bloqueio explícito:** `DROP COLUMN RESTRICT` remove automaticamente índices e CHECKs locais das colunas. O rollback B3.1 bloqueia views e perda de valores, mas **não recusa dependências automáticas**. Não promover o arquivo antes de candidata sucessora com inventário/gate completo. Gates/literais/hash dos dois candidatos antigos permaneceram inalterados.

## 1. Evidências e limites de autoridade
| Evidência | Origem e alcance |
|---|---|
| PUC=0, PTC=0, campos ausentes | Auditor externo, informado no prompt; não leitura hospedada nova pelo agente |
| Backup recuperável | Auditor informa ausência de evidência; implantação bloqueada |
| Commit c9d7f4ba324d9c6974a57d42c9a365987d0a0683 | git show read-only: merge com sete arquivos documentais/testes/roadmap, sem runtime |
| 59 / MD5 97e96aa537418f63d7a9b32574dbf7cc | Baseline B3.1 histórico; definição SQL revisada, não reconfirmação live |
| Revisão independente | Duas investigações read-only separadas: DDL/rollback e contrato server-owned; achados conferidos no código/local |
| Destino | config canônica swzpzcwiasxmjutrmvkm; nenhuma ferramenta de banco usada neste turno |

Não houve SQL hosted, Auth, impersonation, alteração de linhas reais, grants/policies/telas ou publicação. Config/literal SQL/current_database/GUC não comprovam destino da ferramenta; auditor precisa provar endpoint/ref antes de qualquer consulta externa. Homolog não foi acessada e não é presumida fiel.

## 2. Manifesto, digests e preflight
Os CTEs antes/depois do candidato e rollback B3.1 têm mesmo recorte/serialização/hash/contagem. Incluem bodies/owner/ACL de funções selecionadas lexicalmente, políticas, definição/estado dos triggers, constraints e RLS/ACL das duas tabelas. ORDER BY key é determinístico sob textualização/contexto de catálogo estáveis; MD5 detecta drift, não assina segurança. Exportar em snapshot consistente, com contexto/search_path consistente; nunca substituir hash só para passar gate.

**Fora do digest original:** colunas/defaults/ACL de coluna/comentários, índices, owner/opções de relação, views/rowtype/dependências, corpos de triggers genéricos sem nomes das tabelas, publicações e consumidores dinâmicos/externos. Teste novo manteve digest antigo idêntico após ADD COLUMN enquanto JSON dinâmico passou a expor metadata: igualdade não prova neutralidade funcional.

Novo preflight SELECT-only exporta inventário ampliado e dependências transitivas de relação/tipo composto, triggers/functions, índices/FKs, funções dinâmicas heurísticas, default ACL, herança/publicações/locks e dependências automáticas das colunas. Não há hash ampliado live aprovado. Heurística lexical pode perder tabela construída dinamicamente, views indiretas e integrações; dependências catalogadas complementam, não provam cobertura universal de PLpgSQL/externos.

### Uso externo somente leitura
1. Provar endpoint/ref e registrar operador/UTC, sem secrets/PII.
2. Auditor abre snapshot consistente READ ONLY e executa/exporta integralmente `vinculos-b2b-f2b32-preflight-readonly-20261018.sql`, encerra a transação imediatamente. O arquivo contém apenas SELECTs; SELECT privilegiado não é teste RLS.
3. Exigir manifesto antigo exato, PUC/PTC 0/0 e campos ausentes; revisar TODAS as linhas do ampliado e contratos fora catálogo. Drift exige investigação, não troca cega do hash.
4. Nenhum resultado libera DDL nesta fase: backup/restore ensaiado e autorização específica faltam.
5. Após eventual implantação externa posterior, executar postflight + preflight ampliado no mesmo snapshot; diferenças permitidas somente duas colunas e seus comentários. Zero metadata preenchida; ACL/RLS/containment/bodies/constraints/índices/dados preservados. Postflight não certifica login/A/B.

## 3. Efeitos e riscos revisados
| Achado | Evidência / consequência |
|---|---|
| Nullable sem default | Normalmente sem reescrita de heap; ainda invalida planos/rowtypes/schema caches. Sem rewrite não significa sem efeito |
| Grants de tabela | SELECT/INSERT/UPDATE existentes incluem novas colunas sob RLS atual; reproduzido local. Não aumenta linhas autorizadas pelo DDL, mas aumenta superfície visível/editável |
| ACL de coluna/default ACL | Inventariar separadamente. Default privileges não se reaplicam ao ADD COLUMN, mas importam em objetos novos/recriação |
| SELECT * / JSON / NEW | Tabela/rowtype/serialização inteira expõem chaves extras; podem afetar APIs/audit/validators ou ser confundidas com origem confiável |
| Views | View antiga SELECT * mantém colunas expandidas na criação; nova/recriada incorpora metadata (testado). Projeção explícita antiga não prova segurança dinâmica |
| RPC rowtype / prepared query | Saída pode mudar sem body mudar; prepared SELECT * pode exigir reprepare/erro de tipo. Hipótese a ensaiar com drivers reais, não defeito hosted comprovado |
| Locks ACCESS EXCLUSIVE PUC/PTC | Bloqueiam inclusive SELECT (reproduzido). PUC travada para congelar precondição zero embora só PTC mude |
| Timeouts | 3s por espera de aquisição; 30s por statement, não total da transação. Sessão abortada pode segurar locks até ROLLBACK/disconnect; execução contínua sem pausas/auto-retry |
| Partições/herança/Realtime/jobs | Exigem inventário real e post-audit, clientes antigos/schema caches/importadores/exportadores incluídos |

**Neutralidade funcional universal não comprovada.** Metadata é não confiável e não pode autorizar ou orientar cleanup. Integradores/deployments futuros precisam regra explícita e responsável; ausência lexical anterior não os exclui.

## 4. Rollback e ON DELETE
Gate de aprovação, digest antigo e recusa de metadata preenchida são necessários, não backup. `DROP COLUMN RESTRICT` bloqueia view nova, mas remove índices/CHECKs locais automaticamente mesmo com metadata NULL: teste local reproduziu remoção dentro da transação e verificou preservação após ROLLBACK.

Sucessora deve recusar **toda dependência de coluna**, normal/automática, drift ampliado, valores, ACL/índices/constraints e consumers dinâmicos, com revisão explícita de qualquer exceção. Não remover valores/dependências para forçar rollback. Depois de consumo autoritativo/povoamento: forward-fix/compensação; restore integral exige reconciliar gravações legítimas pós-snapshot de outras tabelas.

Sem FK PTC→PUC: ADD COLUMN não modifica ON DELETE. Parceiro/cliente mantêm CASCADE e podem apagar carteiras/histórico como antes; DELETE PUC não limpa PTC e source candidata pode ficar órfã. Nenhuma FK/pai foi alterado; testes de delete anteriores são só fixtures. Não instalar RESTRICT ou CASCADE de source por conveniência.

## 5. Backup e próximo mínimo útil
`vinculos-b2b-f2b32-backup-recuperacao-20261018.review.md` traz checklist de backup ID/status/UTC/retention, cobertura, destino isolado autorizado, ensaio real de restauração, RTO/RPO observados e reconciliação. **Todos pendentes.** Dump/botão/PITR presumido não comprovam restore. Nenhuma cópia de usuários/PII/secrets autorizada; proprietário precisa aprovar método/destino e cobertura segura, mantendo serviços de comunicação OFF.

**Avançar já: desenho B3.3-A**, não instalar staging. Documento `vinculos-b2b-f2b33-contrato-server-owned-20261018.review.md` define dataflow, actor vs target, source/receipt, colisões direct/unknown, locks, revalidação, revogação, histórico, fases e testes. Não cria modelo paralelo; usa RPCs/sync/validator existentes, ainda fechados.

Bloqueadores da candidata funcional:
- Assign/unassign sem partner_id/contexto, CAS ou idempotency key: decisão de evolução compatível sem abusar notes/reason.
- Tickets existentes só txid/scope/target: provar receipt que amarre ator/tenant/source/versão/conteúdo e emissores; ticket genérico não basta.
- Audit existente sem contrato B3.3 de imutabilidade provado: inventariar/adaptar, não duplicar grants.
- Sync sobrescreve direct/unknown: source comprovada e colisão abortam transação inteira, writer direto legítimo preservado.
- Validator impede cleanup de alvo inelegível: ramo monotônico com prova privada de ator/relação, sem bypass de grant/regrant.
- Revogação perfil/papel/vínculo não dispara sync: readers fail-closed + writers/ordem de locks comum incluindo cf_user_guards; outros vínculos/papéis não afetados.
- Provas JWT/RLS reais A/B/legado/Storage/cache e positivo legítimo pendentes. Preservar commercial_owner/legacy_partner_tenant; owner=profile.organization_id não universal.

Novas leituras servidor após commit precisam negar revogado; snapshots em curso, URLs assinadas até TTL e bytes já obtidos têm limites. Não prometer recolhimento universal. Cache foundation continua fechado, sem fan-out UPDATE profiles.

## 6. Arquivos e testes reais
Novos: este relatório; checklist backup; SELECT-only preflight/postflight; desenho B3.3; `vinculos-b2b-f2b33-fases-candidato-bloqueado-20261018.sql` (marcador de fases que **recusa execução**, não migration funcional pronta); `scripts/tests/b2b-f2b32-review-local.py`; `src/test/saas/b2b-f2b32-review-postgres.test.ts`. Atualizados: alerta no relatório B3.1, roadmap e AGENTS. Candidato/rollback B3.1 inalterados, nenhuma alteração runtime.

Às **19:19:20 UTC**, Vitest focado: **5 arquivos/5 testes passaram**, B3.2/B3.1/B3/B2/B1. **12 checks novos** de semântica, somados aos 94 experimentos anteriores: 106 verificações locais, não 106 testes RLS. Incluem read-only pre/postflight, rowshape/JSON/ACL, digest incompleto, dependências automáticas e bloqueio de SELECT. Erro esperado tem mensagem específica e erro inesperado falha; nenhum SKIP. Marker B3.3 também testado como recusa específica na rodada final.

Não houve teste funcional do contrato B3.3 porque ele é desenho; nenhuma prova hosted de concorrência/login/A-B/JWT/Storage/restore. PostgreSQL sintético não replica segurança real. ESLint focado exit 0; lint global não executado. Build automático observado OK **19:19:37 UTC**; typecheck/build manuais não executados conforme ambiente, sem alegar PASS de typecheck independente. Resultado final de regressão registrado após última alteração do harness.

SHA-256 preservado dos arquivos antigos:
- Candidato: `f9e5c793594d99821765246c4ea280220b533b9ea8ac9341884783ee046e3239`.
- Rollback: `588290484489f3adf4c75956af82e3c350f78ae606e4601f4eb72166e1a522aa`.

**Status final:** preparação PASS delimitado; B3.2 implantação NO-GO por backup recuperável + rollback/consumers; B3.3-A desenho permitido, candidata funcional e cutover NO-GO até fechar contratos e provas reais. Próximo prompt mínimo útil está no documento B3.3, sem autorização implícita para próxima implementação.