# Plano vigente — catálogo agrícola por abas

Resumo de `docs/auditorias/catalogo-agricola-plano-implantacao.md`, documento canônico com 17 seções.
Data do plano: 09/10/2026, America/Sao_Paulo. Substituição solicitada: 10/10/2026 03:01 UTC.
Estado: planejamento; nenhuma nova aba agrícola publicada. Plano anterior revogado, sem restauração de aprovações.

## Escopo exato
- **Biológicos:** Todos, Biofungicidas, Bioinseticidas, Inoculantes, Solubilizadores; outras classes só após inventário.
- **Químicos:** Todos, Herbicidas, Fungicidas, Inseticidas.
- **Fertilizantes / Adubos:** filtros confirmados pelo inventário, sem taxonomia inventada.
- Sementes e Tratamento de sementes adiados: fora de campos, abas, integrações e testes específicos desta implantação.
- Preservar Todos os produtos e Pendentes de classificação; reutilizar /base-tecnica, aliases, ProdutosTab, cadastro, catálogo técnico e IDs/SKUs/saldos únicos.

## Regras e detalhes técnicos
Família, classe e finalidade são eixos distintos, com dupla função avaliada sem duplicar produtos. Não sobrecarregar produtos.tipo, inferir natureza por nome ou classificar legados automaticamente. Novos nomes de campos/tabelas apenas após verificar estruturas existentes. Classificação pendente/revisada, autoria/data/motivo e unidade comercial explícita; opcionais no legado, obrigatórios no fluxo novo revisado.
Unidade/formulação, não família, orientam cálculos; sólidos biológicos/químicos também existem. Conversões explícitas compatíveis com a dimensão, sem kg→L implícito nem preçoL aplicado a kg/saco. Preservar snapshots históricos e preço canônico. Canal incompatível permanece bloqueado até aceite independente.
Escrita global somente Platform Superadmin validado no servidor. Preservar RLS, guards, entitlements, vínculos, cache por identidade/tenant/escopo/filtros e portais técnicos sem preços indevidos. Supabase exclusivo swzpzcwiasxmjutrmvkm; nenhum uso de Cloud/outros refs.

## Fases A–F futuras
A. Inventário de campos/RPCs/unidades/classificações/canais; entregar delta antes de DDL.
B. Dados aditivos, validação server-side, auditoria e revisão controlada; sem liberar venda nova.
C. Três abas/subabas/filtros e cadastro existente, URL/voltar e acessibilidade.
D. Fichas, técnico, mobile e portais conforme permissões.
E. Pedidos → estoque → entrega → financeiro/fiscal, cada família/unidade/canal com aceite próprio.
F. Implantação gradual autorizada, contas reais, monitoramento e rollback preparado.

## Testes, aceite e rollback
Testes focados/schema/RPCs, UI desktop/mobile, teclado/leitor de tela, dois tenants AR/FSF, roles reais, IDs forjados, cache/entitlements, unidade e saldo único. Typecheck/lint/scanner/build com provas PASS/FAIL/UNVERIFIED. Claims SQL não são login HTTP real. Navegação/classificação PASS não homologa operações.
Rollback desliga abas/canais e retorna interface anterior preservando dados/classificações/histórico, sem DROP ou restauração de vazamento. Sem dados técnicos fictícios, doses/recomendações inventadas, cobrança, mensageria ou emissão fiscal.

## Limites desta solicitação
Somente substituição documental já autorizada, resumo e roadmap; nenhum DDL/código/grant/AGENTS/dependência/gate/publicação ou fase funcional neste job. Não chamar plan.show; não reutilizar aprovações antigas. Inventário integral/ACL/RLS atuais/HTTP/JWT/unidades dos canais permanecem UNVERIFIED. Financeiro amplo permanece aberto; fechamento externo 4717ff86 no H6/roadmap não é certificação global. A implementação depende de solicitações focais posteriores.
