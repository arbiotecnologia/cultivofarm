# Consulta técnica incerta não é negativa — revisão frontend

Base fixa: `2f95d5be6dd27834e69bfc9155540a04b0a6e914`. Apenas frontend/testes; nenhum SQL, grant, cliente paralelo, monitor, assinatura, receivables ou lote alterado.

## Correção
- AppPortalGuard, MobileLayout e guardas técnicas filhas ocultam conteúdo em consulta pendente/refetch/erro. Só resposta canônica explícita `has_technical_access=false` nega. Não há navegação para gestor por latência.
- Estado indisponível reutiliza `revalidateAuthz` do botão canônico: releitura fresca, single-flight, epoch, descarte de cache/Blobs e probe do provider publicado. Fora do monitor, a query existente é reconsultada; nenhuma autorização por papel/cache.
- `requireFresh` só nos leitores técnicos; outros portais preservam o contrato de exposição de dados durante refetch. Mesmas query keys por identidade/perfil/tenant/papéis/epoch, sem cache global novo.
- Payload ausente/malformado vira indisponibilidade, não negativa. Deadline de transporte 15 s por tentativa + retry já existente de 1; abort, fence de geração/epoch e check monotônico antes da adoção. Deadline da query não estende lease do monitor.
- Leitores técnicos desativam refetch-on-mount: evita ciclo parent refetch → child unmount → remount → refetch; foco/invalidação/refetch explícito permanecem.

## Evidências locais
- Reproduzidos na baseline: erro após invalidação redireciona indevidamente; erro inicial redireciona; contexts sem resposta impede Retry operativo. Nenhum diagnóstico de causa de banco/rede.
- 302/302 Vitest, 12 arquivos: AuthProvider/monitor/probe/guardas/query reais com transporte fake, timeout/renovação, contexts pending→valid/erro→valid/negativo, ambos os subsets, late epoch, zero/malformed payload, deadline sem rerender, isolamento de tenant/identidade nos testes de escopo existentes.
- São testes sintéticos, não homologação JWT/RLS real. Fonte de monitor/probe/gates inalterada em relação à base.
- Build automático registrado OK. Typechecks app/node não executados manualmente neste ambiente (harness automático); revisão independente deve executar `tsgo -p tsconfig.app.json --noEmit` e `tsgo -p tsconfig.node.json --noEmit` e registrar recibos.

## Revisão e rollback
1. `python3 scripts/monitor-context-recovery/rollback.py` verifica todos os hashes, sem alterar arquivos.
2. Revisar `frontend.patch`, `manifest.json`, testes e delta contra base fixa. Publicação exclusiva após revisão do proprietário; nenhum passo publica automaticamente.
3. Rollback local explícito: `python3 scripts/monitor-context-recovery/rollback.py --apply`. Valida TODOS os arquivos antes de escrever; restaura bytes fixos e remove só arquivos novos deste pacote. Reverter documentação/roadmap separadamente se desejado. Não reaplicar nenhum SQL.

## Limites e infraestrutura
Evidência independente informada: gateway v2 448 calls/52 >3 s/p95 7151 ms/max39453; v1 977/0 >3 s/p95 429/max2779; upstream v2 max484 ms. Correção de UI NÃO resolve latência externa, não força versões/headers e não infere causa. Lease15s, piso7.5s, bounded loader20s e orçamento automático publicado intactos. Sessões suspensas/rede lenta continuam podendo pausar corretamente; respostas vencidas não são aceitas.
Homologação real sem reload requer sessões A/B e publicação independente. Neste ambiente `external_unmanaged` impede restauração gerenciada; não há prova autenticada real desta candidata. Contratos/novos portais/anexos novos permanecem bloqueados.
