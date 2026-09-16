# Correções pós-implantação da redução da base de cálculo (C1–C9)

Escopo grande: nove frentes encadeadas. Preservo toda a arquitetura atual (`fiscal_tax_rules`, `tax_input_snapshot`, `base_reduction_mode`, `fn_fiscal_apply_tax_v2`, fluxo do Rascunho, motor XML). Sem fluxo paralelo, sem publicar, sem GitHub, sem Lovable Cloud. Banco único: o projeto Cultivo Farm.

## C1 — Reconciliar migrations e tipos
Mover as duas migrations da redução de `restoration/fiscal-reducao-base` para `supabase/migrations`, mantendo SQL incremental e idempotente, e registrá-las pelo fluxo oficial após conferir que o SQL corresponde ao que já está no banco (schema, constraints, funções, RLS). Atualizar o arquivo canônico de tipos com `base_reduction_mode`, `tax_input_snapshot` e `rpc_fiscal_tax_preview_v1`, removendo os casts temporários que existiam só por tipo desatualizado.

## C2 — Fluxo real do rascunho
Auditar `rpc_fiscal_draft_save` e materializar no servidor os snapshots físicos do item (NCM, CEST, origem, CFOP, CST) a partir dos perfis validados, sem confiar no frontend. Teste obrigatório: rascunho criado só pela RPC → item com `ncm_snapshot` preenchido → cálculo roda sem nenhum INSERT manual.

## C3 — Frete, seguro e outras despesas
Hoje o rateio é feito na tela e os valores não são persistidos nos itens, o que pode divergir do cálculo definitivo. Criar rateio canônico no servidor (proporcional ao valor bruto), com tratamento determinístico do resíduo de centavos, garantindo que a soma por item bata exatamente com o total. Preview e cálculo definitivo usam o mesmo mecanismo; a tela deixa de calcular. Teste com múltiplos itens e resíduo de arredondamento.

## C4 — Paridade entre prévia e cálculo definitivo
Extrair a apuração do item para um helper server-side único, contemplando ICMS, IPI, ICMS-ST, FCP, FCP-ST, DIFAL, PIS, COFINS e os modos NONE/FIXED/MANUAL. Prévia e cálculo passam a chamar o mesmo mecanismo; a única diferença é que a prévia não grava. Teste comparando o JSON da prévia com o snapshot gravado, tributo a tributo.

## C5 — Auditoria da redução
Corrigir `fn_fiscal_audit_base_reduction`, que lê `taxes` como array quando o motor grava objeto indexado por tributo. O formato canônico do snapshot não muda; o teste artificial é substituído por outro baseado no snapshot real. Auditoria completa (documento, item, tributo, percentual anterior/novo, motivo, usuário, data, regra, versão, fundamento legal, modo). Motivo obrigatório na redução MANUAL. Documento congelado continua bloqueado.

## C6 — XML: PIS/COFINS por CST e modalidade da BC
Dispatch fail-closed por CST: grupo de alíquota usa PISAliq/COFINSAliq; CST não tributado usa PISNT/COFINSNT; demais CSTs só se homologados, caso contrário erro técnico explícito. Nunca forçar CST incompatível dentro do grupo de alíquota. Auditar `modBC`: se só o valor da operação estiver homologado, bloquear regra incompatível em vez de gerar XML errado. ICMS20/pRedBC e IPI preservados.

## C7 — E2E real
Cenário percorrendo o mesmo caminho da aplicação: criar rascunho pela RPC do wizard, salvar itens, redução MANUAL, prévia, salvar, cálculo, comparar, preparar XML e validar no esquema oficial. Fixture obrigatória (10.000, 60%, 18% → base 4.000, ICMS 720) e um segundo cenário com frete, seguro, outras despesas e vários itens, provando zero diferença de centavos. Perfis administrador, financeiro e sem permissão; desktop e mobile.

## C8 — Implantar a função de geração do XML
Só depois de C1–C7 aprovadas: implantar `fiscal-xml-engine` no ambiente de homologação, com JWT obrigatório, sem chave de serviço no frontend, ambiente de teste e gate preservado; depois uma chamada autenticada real. Produção continua desativada.

## C9 — Regras fiscais de homologação
Criar fixtures claramente marcadas como homologação (ou publicar regras reais já validadas), com bloqueio de uso produtivo e rollback previsto. Sem inventar tributação produtiva.

## Regressão e relatório
A cada fase: typecheck, build, testes fiscais, XSD, RLS, permissões de RPC, concorrência, idempotência, imutabilidade de snapshot, NF-e sem redução, FIXED/MANUAL/NONE, 0/25/60/100%, valores inválidos, CST incompatível, frete/seguro/despesas, múltiplos itens. Testes errados são documentados e substituídos, nunca afrouxados. Relatório por fase em `docs/auditorias/`.

## Limites
Toda migration incremental, reversível, sem apagar dados nem recalcular snapshots históricos. Qualquer inconsistência falha fechada e preserva o rascunho. Nada de publicação, GitHub ou banco interno do Lovable Cloud.

## Execução
Sugiro entregar em blocos: C1+C2, depois C3+C4, depois C5+C6, depois C7, e por fim C8+C9 — cada bloco com relatório e validação antes do seguinte.
