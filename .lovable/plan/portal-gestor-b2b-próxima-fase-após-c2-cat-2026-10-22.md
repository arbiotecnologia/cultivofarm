# Portal gestor B2B — próxima fase após C2-CAT

## Resultado pretendido
O gestor acompanha sua própria empresa: indicadores e pendências, catálogo, finanças pertinentes, pedidos/operações e equipe conforme autoridade comprovada. Não recebe acesso interno irrestrito ao fornecedor.

## Sequência de entregas separadas
1. **Concluir C2-CAT:** runtime já promovido no commit95738f51; publicação pelo auditor e homologação UI pendentes. Registrar negativas administradorB e positivas teste4 como provas do auditor, sem tratar HTTP200 como homologação de todos os canais.
2. **Primeiro recorte candidato — acompanhamento próprio:** reutilizar pedidos próprios já lidos pela RPC canônica para indicadores e pendências observados, sem abrir DashboardPremium completo, financeiro, mensagens, carrinho ou escrita. Catálogo/fichas conservam capacidades e entitlements atuais.
3. **Financeiro pertinente:** inventariar recebíveis/pagamentos/saldos/vencimentos/documentos por operação×perfil×empresa. Provar distinção entre obrigações do parceiro e contas internas do fornecedor antes de habilitar leitores. Se faltar contrato, preparar SQL candidato guardado/preflight/rollback sem aplicar.
4. **Operações/equipe e multipapel:** inventariar pedidos/simulações/entregas/OS/filhos/vínculos e coordenar readers/provisioning/seletor existente para gestor/técnico/produtor. Não instalar writers C2.1 isoladamente.

## Detalhes técnicos e testes do primeiro recorte
- Reutilizar `get_my_commercial_orders_projection`/`useMyCommercialOrders` e tela atual, sem fonte paralela nem polling adicional.
- Resposta limitada100: apresentar indicadores do recorte observado, não totais globais/saldos inventados. Classificação de status precisa inventário canônico.
- Testar atorA/B, tenant, vínculo revogado/futuro, técnico/produtor sem finanças, resposta tardia/lease, erro stale, limites e ausência de montagem de canais irmãos.
- Diff candidato separado com types/build/testes e instruções de reversão; homologação JWT/RLS/UI real pertence à etapa independente.
- Inventário inicial e matriz: `docs/portal-gestor-b2b-next-slice-20261022.md`.

## Limites
Sem DDL/DML hosted/publicação automática, alteração de roles/sessões, reload, aumento de lease ou retirada de proteção. Sem todoOutlet/gestor interno, backfill ou autorização por UUID. C2.1 inativo até contratos coordenados e testes de triggers completos. Pendências antigas continuam abertas; plano antigo floor12 segue rejeitado e não é reativado por esta fase.
