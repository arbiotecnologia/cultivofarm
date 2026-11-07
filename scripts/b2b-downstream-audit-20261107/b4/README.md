# Reconciliação B4 útil sobre o B3 atual — somente local

**Candidato inativo, revisável e não liberado.** Nenhuma operação hospedada, NF/cobrança/aprovação contábil real, envio, publicação ou subagente. O histórico `301bf597` (134 PG/1327 Vitest relatado) não foi presumido equivalente nem promovido.

## Comparação de fontes e cadeia estática

Os pinos READONLY informados pelo auditor foram confrontados com `scripts/delivery-atomic-hardening-20261030/capture/current.json`. As capturas locais correspondem aos MD5 informados para ajuste/aprovação/rejeição, geradores, gatilho automático, autorização fiscal, eligibility/exposure e capability de envase. Isso **não é uma nova consulta LIVE**.

ACL locais conferidas: ajuste/aprovação/rejeição e geradores cliente têm `authenticated EXECUTE`; autorização fiscal, confirmação e engine são service-only na captura. A capability de envase tem MD5 local `f4b804310d5a3db959bf6e2a27f793e0`; UI fechada não foi usada para deduzir exposure.

`rpc_fiscal_invoice_apply_authorization_v1` recusa `PRODUCTION`, mantém reconciliação pendente e não chama gerador de recebível. `fn_generate_receivable_from_entrega` tem replay por `entrega.receivable_id` antes de guards posteriores e não mostra reautorização pós-lock no corpo capturado; isso ficou como risco de revisão estática, não vulnerabilidade LIVE demonstrada. Nenhum desses writers foi executado.

## Artefatos gerados

`generate-b4.py` extrai componentes das fontes pinadas e gera:

- `b4-candidate.sql.review`;
- `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`;
- `04-rollback-deny.sql.review`;
- `b4-pins.json` e `SHA256SUMS`.

Não há overloads create/simulate antigos, writer Price de emissão, grants cliente para o alocador privado ou alteração do scheduler estimado B3. O scheduler B4 separado calcula datas finais pela emissão da NF com o calendário selado `paracatu-mg-2026-2027-v2`; fora da cobertura falha fechado.

A visão privada B4 combina snapshots não cotados do B3 e o snapshot append-only da resposta de cotação. Elegibilidade canônica, origem e pendência contábil são revalidadas após locks. Rollback é deny-only e preserva documentos, títulos, alocações, reversões e snapshots.

## Bateria final — 63/63, exit 0

Executada por `test-b4-b3.py` em PostgreSQL descartável com B3 atual instalado, seus **32 gatilhos reais carregados** ativos e os writers capturados necessários ao PRE. Os 38 gatilhos pertencem ao pacote separado de ajuste e não foram misturados a esta contagem.

Cobertura executada:

- cotação B3 real com centavos e pedido direto, ambos aprovados/economicamente selados;
- gate fiscal/contábil não comprovado fechado antes da costura fictícia; cliente sem EXECUTE no alocador;
- três documentos parciais independentes, replay idempotente, quantidade/residual e um título por documento;
- exposição = pedido restante + títulos em aberto, sem dupla contagem; baixa de R$ 10 reduz somente o título;
- Price sem segundo acréscimo de juros; primeira data final baseada na NF e no calendário;
- cancelamento pago negado; substituição intermediária não paga com preservação exata dos centavos e histórico;
- quantidade excedente, tenant estrangeiro (`forbidden_partner`), pendência contábil e writer antigo negados;
- snapshot B3 não cotado, calendário fora da cobertura, corrida de duas sessões e rollback deny-only;
- PRE/POST/rerun e pinos de função; create/simulate B3 inalterados e autorização fiscal sem integração de recebível.

Evidências: `evidence-b4-b3.json`, `test.stdout.txt`, `test.stderr.txt`, `test.exitcode`; manifesto e hashes em `evidence-manifest.json` e `evidence-SHA256SUMS`.

## Costuras e limites obrigatórios

Auth usa GUC/roles locais; funções privadas são chamadas por um adaptador servidor local sem `SET ROLE`, separado das provas de negação cliente. `c2_order_partner_recipients` é uma costura sem destinatários usada apenas para concluir a aprovação. Schema financeiro é capturado com FK/RLS externos omitidos. NF autorizada/cancelamento e atestação contábil são fixtures locais sem rede; `b2b_integration_dependencies` só é substituída depois de provar a negação real.

**Não é prova JWT/RLS/Storage/PostgREST/browser, emissão fiscal, cobrança real ou E2E de produção.** Revisão LIVE, homologação e decisão de implantação continuam com o auditor. A reconciliação posterior em `../physical/` eliminou o drift de composição e executou 123/123 cenários físicos biológicos ml; isso não altera o B4 nem seus 63/63. Químicos/fertilizantes kg/g e demais apresentações físicas continuam NOT_RUN.
