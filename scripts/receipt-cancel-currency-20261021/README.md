# Recibo cancelado não pode servir o PDF ISSUED anterior (21/10/2026)

Base publicada: `3d1fb7d2` (Edge v91 sem assinatura; policies `receipt_no_capability_*` já aplicadas — não reaplicar).

## Causa
- `cancel_financial_receipt` (migration 20261005200923): SECURITY DEFINER, h15 + `is_financial_staff`, motivo ≥5,
  só muda `status/cancel_reason/canceled_by/canceled_at` e audita; não toca `storage_path` nem objeto.
- `RecibosList` só chamava a Edge quando `storage_path` era vazio → recibo CANCELED abria os bytes ISSUED.
- Edge v91, quando chamada para CANCELED, sobrescrevia (upsert) o objeto ISSUED histórico.
- Blob preparado não era reconfirmado no clique; cancelamento concorrente/outra sessão não o invalidava.

## Correção (runtime local, não publicada)
- Locator ligado ao status (`receiptCurrentState.ts`): ISSUED → `<org>/<ano>/<num>.pdf`; CANCELED → `<num>.canceled.pdf`.
- Lista e `EmitirReciboButton`: releitura RLS fresca antes da Edge, após os bytes e no clique "Baixar PDF";
  divergência → `opener.discard` (revoga Blob) e exige novo preparo. Exige `status` na resposta da Edge.
- Opener ganhou só `discard(path)`. Monitor/lease/Auth/gates/CQ/OS intactos (`useAuth.tsx` b3a65696…).

## Edge candidata (`edge-review/`, NÃO implantada)
- CANCELED renderiza no próprio caminho, sem atualizar `storage_path`; ISSUED histórico preservado.
- Relê status após upload; ISSUED que perdeu corrida com cancelamento falha fechado sem atualizar locator.
- Retorna `{path, receipt_number, status}`; sem assinatura/`url`.
- **Ordem**: implantar Edge antes do frontend. Com v91 + frontend novo: CANCELED falha fechado; botão Emitir também
  exige `status` → ficaria indisponível até a Edge. ISSUED já gerado na lista não depende da Edge.

## Escopo de revogação
- Revoga: Blob preparado em qualquer aba/sessão no próximo clique; preparo concorrente; resposta tardia.
- Não revoga: bytes já baixados, cópias/cache do navegador, URLs assinadas antigas (até expirar/cache CDN).
- O objeto ISSUED histórico continua acessível por download autenticado direto do Storage a staff do tenant
  (policies atuais); a UI apenas não o oferece como atual. Bloqueá-lo exigiria SQL separado — não preparado.

## Testes
- `receiptCancelCurrency.list.test.tsx` (baseline reproduz a falha; runtime corrige), `receiptCancelCurrency.edge.test.ts`.
- Financeiro+config+security: 2228/2237; 9 falhas preexistentes: 8 `financialReport*`, 1 `d51-5` (literal da assinatura removida em v91).
- Simuladores antigos: só `limit/abortSignal`, `status` e `waitFor` no clique assíncrono; asserts preservados.
- tsgo e build PASS. `preflight.sql.review` somente leitura; `rollback.py` restaura só a Edge v91 (sem assinatura);
  restaurar a lista baseline reintroduziria a falha e não é oferecido.
