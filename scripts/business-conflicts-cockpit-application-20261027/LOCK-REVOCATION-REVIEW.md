# Locks/revogação — achados separados, sem correção neste delta

## Lote LIVE

Ordem: leituras h15/readiness/SaaS/esteira → tabelas globais invites/onfarm/catalog SaaS SHARE → advisory programação → OS FOR UPDATE (por ID; tenant checado depois) → profile/roles SHARE → organization UPDATE → subscription/overrides/referências SHARE → programação/lote UPDATE → revalidação h15/readiness/papéis/SaaS, validações → escrita/condição final/auditoria. Runtime já usa lock_timeout 3s via set_config transacional.

Não há gate `cf_user_guards_v1.state` explícito no corpo ou no h15/platform_actor_access_ready capturado. Locks globais e OS antecedem perfil/papéis: possível inversão com outro escritor que bloqueie profile/organization antes de OS; não provado deadlock neste lote. Revogação comprometida antes da leitura pós-lock deve ser vista em READ COMMITTED, mas se a operação já detém SHARE do perfil/papel a revogação pode ficar atrás dela. Não afirmar que revogação venceu nesse ordenamento. Fonte exige READ COMMITTED e não trata serialization_failure.

## Aplicação LIVE

Ordem: profile SHARE → h15 → organization/roles/invites SHARE → OS/onfarm/referências SHARE → advisory UUID de aplicação → recibo UPDATE → predecessora UPDATE → evidências/Storage SHARE → revalidação h15/create/access → replay ou finalize transacional. Sem lock_timeout runtime explícito neste corpo e sem gate canônico explícito nos helpers capturados. Não adicionar timeout/gate nesta etapa mínima: exigiria revisão própria da ordem inteira e seus consumidores.

Profile lock cedo pode linearizar revogação atrás da operação; um pedido aguardando advisory/predecessora **não prova** que revogação ocorreu antes dela. Ordem entre OS/organization/profile/invites e outros escritores merece inventário separado. Serialização genuína, deadlock e lock timeout permanecem códigos originais, sem conversão para PT409.

## Ensaio real independente bounded (não realizado)

1. Capturar PRE+hashes/ACL e revisar as operações canônicas de revogação, inclusive locks/gate que elas realmente usam; não inferir gate pela presença de h15. Reutilizar fixtures legitimamente autorizadas e comunicação OFF; não reclassificar dados/papéis.
2. Duas conexões com JWTs legítimos A/B: uma operação alvo e uma revogação canônica. Limitar transações de ensaio por statement_timeout/lock_timeout ≤3s; sem pg_sleep prolongado nem lock global artificial de produção. Confirmar sobreposição por `pg_stat_activity` e `pg_blocking_pids`, registrando somente pids/eventos/tempo, nunca tokens/DSN/PII.
3. Ordenamento revogação commit antes de autorização pós-espera: observar pedido realmente bloqueado e confirmar negação sem lote/recibo/aplicação/auditoria parcial. Restaurar canonicamente somente o alvo e verificar igualdade dos vínculos/papéis/dados originais.
4. Ordenamento operação já detém locks de autoridade: registrar revogação aguardando operação; sucesso anterior ao commit de revogação não é bypass nem prova de revogação vencendo. Chamadas iniciadas após commit devem ser negadas.
5. Se janela não sobrepuser, registrar inconclusivo; repetir só dentro do orçamento aprovado. Não homologar por revogar-e-tentar nem por Auth sintética.

Este pacote não corrige esses riscos, não garante proteção global contra writers alternativos e não herda homologação dos três RPCs de monitoramento já implantados. Contabilidade/SU-518022 e outros 39+6 itens do inventário seguem fora do delta.
