# Etapa 5 — pacote INATIVO; reabertura ainda NO-GO

Destino exclusivo: `swzpzcwiasxmjutrmvkm`. Nenhuma migration instalada, nenhum dado alterado, nenhuma publicação ou mudança de runtime. Houve capturas LIVE de catálogo somente leitura; uma chamada incidental `SELECT 1 WHERE false` pelo executor de dados também não escreveu nada. Não confundir este pacote com uma migration pronta para implantação.

## Resultado e recorte

- Aprovar/programar OS **já têm EXECUTE authenticated**: hashes `1023b9d5210534bee16147e2ce29ee12` e `e374f0ba1698b37523b890dc91682eaf`. Preservados integralmente. Não precisam ser reabertos.
- Criação manual de OS continua INSERT na tela; não foi encontrada RPC específica equivalente. A conversão canônica de visita em OS não substitui esse cadastro. Não foi criado endpoint paralelo.
- Criar/confirmar/cancelar entrega têm wrappers fechados. `candidate-hardening.sql.review` endurece três corpos, **sem conceder acesso ao cliente**. `release.sql.review` recusa a liberação explicitamente. A reabertura solicitada não está pronta para implantação.
- Novo helper privado VOLATILE restringe ator ativo, empresa, cliente/OS, feature e matriz existente, com checagem após esperas; contexto GUC de estoque não autoriza. Operador onfarm requer vínculo de cliente. B2B permanece bloqueado até composição independente.
- Ordem candidata: validação → gate SHARE → validação → advisory → validação → linha → validação. Timeout 3 s. Confirmação reserva advisory `entrega_faturar` antes da linha para evitar inversão com o candidato de cobrança. Não muda mensagens/CAS/replay do motor salvo recusas adicionais de segurança; quantidade NaN/Infinity deixa de passar na criação.

## Arquivos e reprodução

`live/` contém 32 fontes capturadas, preservando CRLF do cancelamento (hash LIVE exato). `build-candidate.py` é gerador offline; `candidate-pins.json` usa SHA256 de fonte, enquanto `local-candidate-hashes.json` contém MD5 real de `pg_get_functiondef` obtido no PG17.9 local. PRE/POST verificam alvos, dependências, ACL/config e fingerprints dos gatilhos. Não são selo de liberação.

```text
python3 scripts/os-delivery-reopening-20261027/build-candidate.py
python3 scripts/os-delivery-reopening-20261027/test-local.py
bun run test -- src/test/entregas/registroEntrega.test.ts src/test/entregas/validarEntrega.test.tsx src/test/cockpit-laboratorio/consultaOnly.test.tsx
```

**39/39 checks PostgreSQL descartável; 49/49 testes frontend existentes.** O ensaio carrega oito corpos LIVE exatos e confirma hashes antes do candidato; reproduz cancelamento cruzado do baseline apenas no banco local com GRANT de teste. Depois verifica negação A/B/anon, replay, uma entrega/evento, recebedor, quantidade não finita, rollback por falha injetada, revogação comprometida enquanto aguarda linha/advisory, ambos ordenamentos do gate, concorrência e timeout 55P03 sem escrita.

**Limites importantes:** Auth, feature/SaaS, esquema reduzido e motores de estoque/avanço são sintéticos/stubs. Confirmação/cancelamento positivos sem estoque são ramos locais que os gatilhos LIVE podem negar; não constituem prova funcional de produção. Não são testes JWT/RLS reais, nem integração completa de lote/envase/estoque/faturamento. Vitest preserva contratos existentes; não prova navegação real nem migração das telas para RPC. Avisos React Router existentes não são falhas de teste.

## Bloqueios concretos antes de liberar

1. Integrar e provar guardas/gatilhos reais de estoque/ledger e referências de lote/OS/cliente. Motor confirma por UPDATE e INSERT direto de movimento; guardas privadas exigem provas adicionais. Não alterar guardas para fazer o teste passar.
2. Cancelamento segura entrega/estoque antes de motores filhos; verificar sua ordem contra stock_p1 e revogação, sem grants transitivos. **Correção do inventário antigo:** LIVE `rpc_estoque_operar_v1` já possui EXECUTE authenticated, hash `c71a9e848eff0a522cbaa3a7ec2949a5`; `rpc_cockpit_cancelar_reserva_v1` permanece service/postgres, hash `b30eb1df9094e4dace1d071b11b6af41`. EXECUTE do wrapper não prova autorização do corpo.
3. Conciliar confirmação com pacote de cobrança ainda inativo, inclusive `not_billable` e efeitos financeiros; executar ambos corpos reais juntos com os gatilhos atuais. A reserva do advisory antecipa a ordem, mas não homologa toda composição.
4. Provar B2B, snapshots e liberação financeira/contábil sem emissão/cobrança real. Candidato deliberadamente recusa B2B; não anunciar fluxo B2B reaberto.
5. Revalidar dependências VOLATILE/STABLE e writers de revogação de vínculos/empresa/feature. Gate de profiles/user_roles tem fingerprints; não foi demonstrada cooperação de todos writers de user_clientes/organizações/feature. Sem proteção completa, NO-GO.
6. Migrar telas de status/cancelamento/rollback e criar OS somente após contratos revisados; cercar ator/tenant/epoch, envelope e rascunho, sem retry cego. Nesta etapa nenhuma UI foi mudada.

## Contenção e próximos gates

`containment.sql.review` apenas revoga EXECUTE dos quatro wrappers de entrega para PUBLIC/anon/authenticated, mantendo postgres/service, SELECT/RLS e OS já liberadas. Nunca restaurar corpos vulneráveis como rollback. Ainda INATIVO, execução somente por auditor com destino confirmado e revisão.

Antes de instalação: verificar ref, capturas atuais, PRE inteiro true, integração real dos bloqueios 1–5 e pacote de release substituindo a barreira **apenas após aceite independente**. Pós-instalação requer JWT real por perfil/empresa e provas bounded de revogação. A fase seguinte não foi iniciada. Contabilidade real e SU-518022 continuam pendentes.