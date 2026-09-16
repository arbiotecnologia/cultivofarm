# Redução da base de cálculo por tributo (NF-e) — Relatório final consolidado

Data: 2026-09-16 · Banco: Cultivo Farm (`swzpzcwiasxmjutrmvkm`) · Nada publicado, nada sincronizado com GitHub, Lovable Cloud não utilizado.

## Escopo entregue por fase

| Fase | Conteúdo | Situação | Relatório |
| --- | --- | --- | --- |
| 0 | Auditoria do schema remoto x migrations, motor fiscal, XML engine, RLS | Concluída | `fiscal-reducao-base-fase0.md` |
| 1 | `fiscal_tax_rules.base_reduction_mode` (NONE/FIXED/MANUAL) + backfill; `fiscal_invoice_items.tax_input_snapshot` validado | Concluída | `fiscal-reducao-base-fases1a4.md` |
| 2 | Motor canônico `fn_fiscal_apply_tax_v2` resolvendo o percentual por modo; `tax_snapshot` estendido; RPC `rpc_fiscal_tax_preview_v1` | Concluída | idem |
| 3 | RascunhoWizard — etapa "Tributos e Totais" com preview server-side, campo de redução somente quando MANUAL, desktop/mobile | Concluída | idem |
| 4 | `buildNfeXml.ts` com dispatch ICMS por CRT+CST, grupo ICMS20 com pRedBC, PIS/COFINS com base efetiva, grupo IPI | Concluída | idem |
| 5 | Bloqueio de preflight em incoerência tributo x redução x CST x grupo XML | Concluída | idem |
| 6 | `fiscal_audit_log` registrando BASE_REDUCTION_CHANGE (usuário, item, tributo, anterior/novo, motivo, regra, versão, fundamento) | Concluída | `fiscal-reducao-base-fases6a7.md` |
| 7 | RLS/RPC: apenas administrador e financeiro alteram parâmetros tributários; SECURITY DEFINER com search_path fixo, REVOKE PUBLIC/anon; documento emitido não aceita alteração | Concluída | idem |
| 8 | Validação do XML contra o XSD oficial NF-e 4.00; correção do `dhEmi`; validador interno reconhecendo os novos grupos | Concluída | `fiscal-reducao-base-fase8.md` |
| 9 | NF-e sintética ponta a ponta em transação revertida — 14/14 PASS | Concluída | `fiscal-reducao-base-fase9.md` |

## Fixture obrigatória

Base 10.000,00 · redução 60% · alíquota 18% → base tributável 4.000,00 · ICMS 720,00 · CST 20 · `pRedBC=60`.
Confirmada de forma idêntica em: teste SQL do motor, preview (`rpc_fiscal_tax_preview_v1`), cálculo persistido, totais do documento, `tax_snapshot` do item e XML gerado (grupo ICMS20).

## Evidências de execução

- SQL do motor (Fases 1–2): 31/31 PASS.
- SQL de auditoria/segurança (Fases 6–7): 14/14 PASS.
- Vitest `buildNfeXml` + XSD (Fase 8): 33/33 PASS.
- NF-e sintética (Fase 9): 14/14 PASS, transação revertida (ROLLBACK), nenhum dado persistido.
- Suíte completa: 1.698 testes aprovados; typecheck sem erros; build OK.
- 6 falhas remanescentes na bateria fiscal são anteriores a esta frente (divergência de tipos SINIEF 49 / `types.ts`) e não tocam a redução da base.

## Artefatos

- Migration incremental idempotente: `restoration/fiscal-reducao-base/20261029000000_fiscal_base_reduction_v1.sql`.
- Testes SQL: `restoration/fiscal-reducao-base/test_*.sql`, incluindo `test_phase9_synthetic.sql`.
- Frontend: `src/components/fiscal/documentos/RascunhoWizard.tsx` e utilitários de XML (`buildNfeXml.ts`) e validação.

## Rollback

A migration é incremental e aditiva: as colunas `base_reduction_mode` e `tax_input_snapshot` podem ser removidas e `fn_fiscal_apply_tax_v2` restaurada à versão anterior sem perda de dados. Nenhum snapshot histórico foi alterado (as tabelas fiscais estavam vazias no momento da aplicação). Em caso de falha no XML, a emissão permanece bloqueada (`fiscalEmissionEnabled=false`, `tpAmb=2`) sem impacto em pedidos, estoque, financeiro ou produção.

## Pendências e riscos

1. **E2E Playwright do RascunhoWizard não executável neste ambiente.** Com o usuário `admin@arbio.com`, a navegação real chega a `/fiscal/documentos` e o diálogo "Novo rascunho NF-e / NFS-e" abre, mas é bloqueado por "Configuração fiscal incompleta — preencha o CNPJ da empresa". As tabelas fiscais do banco Cultivo Farm estão vazias e completar esse cenário exigiria **gravar dados reais** (emitente, cliente, pedido, políticas e regras) — não autorizado. A cobertura equivalente foi obtida pelo cenário sintético SQL da Fase 9 em transação revertida, mais os testes unitários da etapa "Tributos e Totais". Para executar o E2E é necessário autorizar o seed do cenário fiscal em ambiente de homologação.
2. Cenário real na SEFAZ (transmissão em homologação) ainda não realizado — depende de certificado e credenciamento.
3. Recomendação de segurança pendente: **trocar a senha do banco** (`ARbioProjetoOnFarm`), informada em chat.
4. Pendências antigas não relacionadas: edição sequencial de usuários sem atomicidade no backend; divergência da Edge Function `create-user` publicada; 6 testes fiscais falhando por divergência de tipos.

## Declaração

A funcionalidade está comprovadamente correta em homologação técnica (motor, snapshots, XML, XSD, auditoria e segurança), com evidência reproduzível. **Não está declarada apta para produção**: faltam o E2E de tela com cenário fiscal semeado e a validação na SEFAZ.
