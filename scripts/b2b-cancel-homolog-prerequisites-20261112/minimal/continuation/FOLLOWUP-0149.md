# Conferência 01:49 — correção de identidade e infraestrutura sintética fechada

## Correção demonstrada

`issue_graphql_placeholder` imprime `set_graphql_placeholder()` ou `extensions.set_graphql_placeholder()` conforme search_path; comparar o texto de regprocedure era incorreto. `catalog_checks.py` resolve assinaturas qualificadas com `to_regprocedure`; para capturas sem namespace exige **exatamente uma função em todo catálogo com nome, argumentos/OID e MD5 exatos**. Compara `evtfoid/tgfoid` ao OID resolvido. Outro namespace, outro corpo, ambiguidade, evento/tags/estado ou argumentos de trigger divergentes negam.

Para triggers de linha, somente a representação do nome após `EXECUTE FUNCTION` é normalizada; timing/WHEN/colunas/argumentos permanecem byte-exatos. A assinatura não vira whitelist só por nome. O verificador também mantém owner/ACL/config das três definições, colunas/defaults/identidade/generated, constraints/validação, índices, políticas, RLS e conjunto exato dos triggers/event triggers.

## Transporte segmentado

`checks/00–12-install-checker.sql.review`: treze funções privadas instaladas em transações separadas, sem grants cliente, com marcador homolog/OFF, cron zero e A presente; reaplicação recusa overwrite. `99-verify-checker.sql.readonly` verifica fonte MD5/owner/ACL/config de cada parte e roda a bateria de catálogo. Cada B/C/D PRE/INSTALL/POST chama **essa mesma bateria pinada**, não substitui por um flag de sucesso prévio.

Maior segmento de checks inferior a **28 KB**; o B INSTALL cai de verificações repetidas de centenas de campos para cerca de **17 KB**. Não há dependência de concatenar transações ou de temporários de uma conexão anterior. Não foi testado o conector remoto nem seu limite exato; isso reduz tamanho, não garante transporte.

## E fechado

Guard real capturado: `platform_private.homolog_validation_block_receivable_insert()` MD5 **1b7e286b1391c986604df2b171025c62**, postgres/ACL postgres-only/search_path vazio. Hash conferido no PostgreSQL local.

`E-install-closed.sql.review`: gate próprio OFF, allowlist vazia, permissões privadas tx/backend/ator/ação/objeto/row-image usadas uma vez; mesmo trigger de statement ativo e dois guards de linha (título e pagamento da fixture). A linha deve pertencer ao ator interno atual e tenant/pedido/parceiro/NF da concessão vigente, ser HOMOLOGATION, ter imagem integral igual à permissão e nenhum Pix/boleto/gateway externo. Reautorização após lock da concessão/gate. Tráfego normal continua negado; nenhum emissor ou EXECUTE sessão foi criado.

Rollback E mantém a barreira endurecida e histórico e fecha gate/revoga acesso; não restaura o corpo antigo nem apaga títulos/pagamentos. A reinstalação operacional **não foi executada/provada** sobre catálogo integral; não existe habilitação entregue.

## Normalização do candidato de produção

Overlay separado `production-normalization/`: somente capacidade residual troca `aprovado_previsto` por **aguardando_fiscal**; PRE exige baseline candidata MD5 **af146396b98c5b6d9933ba192b783d19** e owner/ACL/config exatos. INSTALL valida fonte normalizada; rollback deny-only revoga leitura da capacidade e fecha gate. Não modifica o candidato congelado nem presume que essa baseline está instalada em produção. Nenhuma aplicação remota.

## UI da cópia

`ui/HomologFinanceSlot.tsx` monta o localizador de título somente com target homolog e capacidade de servidor exata pedido/empresa; título de outro pedido é recusado, revogação retira o ponto e descarta resposta tardia. Integra pelo `extra` do detalhe existente ou ponto Financeiro autorizado da cópia, usando leitor scoped fornecido pelo pai; nenhum cliente/rota/menu/writer novo. O caller canônico existente `OrderDetailCandidate` continua inativo e não é promovido para uma ação sem contrato público instalado.

## Evidências desta rodada

- **27/27** identidade/checks: divergência de display reproduzida sob três search_paths, eventos/tags/estado/namespace negados, definição/argumentos de linha preservados, verificação compacta exercitada, treze bootstrap installers exatos, pins e recusa de overwrite.
- **29/29** B–D/componentes + overlay produção: hashes fornecidos, payloads/POST fechados, rollback, normalização e deny rollback; R$20→0 aguardando_fiscal, CAS/evento único/estados impeditivos.
- **24/24** E/barreira: corpo real baseline, OFF, GUC forjada, alteração tenant/valor/boleto/ator, expiração/revogação, consumo único, batch misto atômico, revogação sob holder/waiter comprovado, pagamento R$1 sintético persistido e história preservada por rollback.
- **22/22** UI em três arquivos: capacidade exacta, leitura título/pedido/tenant e revogação; sem baixa/estorno.
- Overlay teve uma tentativa falha por retirar a newline do prosrc ao calcular pin; falha mantida em evidência, gerador corrigido para preservar o corpo exato e bateria verde. Não houve alteração de asserções.

Comandos: `python3 generate.py`, `python3 test_identity.py`, `python3 test_component.py`, `python3 test_barrier.py`, e `bun run test --config scripts/b2b-cancel-homolog-prerequisites-20261112/vitest.config.ts`.

**Limites:** component schema/Auth/papéis/settings reduzidos/sintéticos; nenhum roundtrip integral de homolog/B3/B4/ponte/provedor, nenhuma sessão JWT/PostgREST/RLS/Storage real, nenhuma prova completa de NF aberta/paga canônica. Os tickets/positivos da barreira são owner-fixtures locais declaradas, não sucesso de endpoint hospedado. Sem typecheck separado ou suíte global. Sem acesso remoto, publicação, emissão/envio/cobrança real ou alteração do original.

**Entrega operacional:** NÃO-GO. A definição E basta para testar a barreira, mas não torna o pipeline financeiro/fiscal canônico instalado; a decisão exata está em `DECISION-0149.md`. Não habilitar E nem aplicar estes segmentos como se homologassem o cancelamento funcional. Hashes em `SHA256SUMS`/`manifest.json`.