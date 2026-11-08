# Evidência POSPLANOS — 08/11/2026 21:45 UTC

Execução fresh em PostgreSQL descritável apenas local/descartável, a partir de espelho temporário dos fontes. O isolamento de planos `cc1f6cc…` foi instalado nesse banco antes do B3/logística, reproduzindo a baseline que o auditor relatou ter instalado em produção. Nenhuma conexão ou operação hospedada foi feita pelo Lovable.

## Resultados

- `run.exitcode`: **0**; `checks.json`: **41/41 PASS**.
- `review-70d08c.json`: **13/13 PASS** — parciais 1+2, restante sem reserva, cancelada parcial, excesso, concorrência e revogações.
- `os-endpoint-tests.json`: **9/9 PASS** — comprador/FSF/revogado/feature/pedido pendente/contabilidade pendente, helper direto e criação concorrente com uma OS + replay.
- `frontend/ui.txt` + exitcode: **13/13 PASS**.
- `frontend/compat.txt` + exitcode: **73/73 PASS**.
- `frontend/typecheck.txt` + exitcode: **exit 0**.
- Build automático da prévia às 21:52:10 UTC: **OK**.

## Hashes confirmados inalterados

- Logística candidata: `8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20`.
- Instalador logístico: `56631263e6ebfe51e9f02822f72c98f895a728f762d3c0ef62c575e44ee7ec09`.
- Endpoint público: `21d40202d32e70dfbb44c7eb2a54a4135ebace840b301c15ab37b910cbfa0ee3`.

`summary.json` registra estado/limites e `SHA256SUMS` os bytes desta evidência. Não somar estas execuções às rodadas anteriores.

## Limites

Auth/JWT/Storage/schema e dados são sintéticos declarados. O SQL do endpoint é o candidato real, mas SQL-role local não prova JWT/PostgREST/RLS/Storage/browser de produção. FSF parou na feature e não é prova isolada de tenant; service_role parou no schema e a ACL do helper foi medida separadamente. UI continua fora do runtime.

A instalação de planos em produção é fato relatado pelo auditor, não evidência gerada aqui. FSF real 6→0 e contagem preservada vêm desse relato; ARBio positivo continua pendente. Não reaplicar planos nem o instalador combinado que os inclui.

Fiscal positivo integrado: **NOT_RUN_BLOCKED_REAL_ALWAYS_DENY**. A dependência real continua negando; zero recebível/documento/alocação foi criado pelo fluxo físico. Sem publicação, envios, cobranças, pagamentos, provedores ou atestação contábil.
