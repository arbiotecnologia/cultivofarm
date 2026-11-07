# Revisão independente 31430566 — ajuste B2B

**Status: INATIVO / NÃO APROVADO / NÃO IMPLANTADO.** Somente PostgreSQL descartável; nenhuma operação hospedada, publicação, cobrança, NF, aprovação contábil, envio ou delegação.

> **Atualização 16:38 UTC:** os 60/60 abaixo são histórico, não base de implantação. O positivo superadmin não prova elegibilidade de admin vendedor. A revisão de escopo vendedor/comprador passou 76/76, manteve o candidato inalterado e negou o externo validado para admin/financeiro/comercial pelo guard real. Ver `scope-live-1638/README.md`; script/evidência antigos preservados em `historical-60/`.

## O que mudou em relação aos 29 PASS

A evidência antiga `../evidence/adjustment-candidate-minimal-29.json` foi preservada como histórico. Ela usava `has_role` e `b2b_phase1_order_visible` mínimos e trocava o pin do wrapper somente numa cópia em `/tmp`; portanto não bastava para revisão de implantação.

O candidato atual tem MD5 `7eb3b5be33552f6bd4eecd56796502ed` e substitui o histórico `55996e9496ffb123504adaeaa502c81f`:

- executa os corpos capturados dos wrappers e dos núcleos privados, incluindo readiness, vínculo, escopo, entitlements e gates SaaS;
- executa `01-pre`, `02-install`, `03-post` e `04-rollback` diretamente, **sem substituir qualquer pin em `/tmp`**;
- pina corpo, owner e ACL do writer e de 14 dependências públicas/privadas; `../adjustment-pins.json` contém os valores e as capturas correspondentes;
- não executa nenhum `GRANT`; `CREATE OR REPLACE` preserva owner/ACL e o rollback continua deny-only;
- autentica antes do escopo, revalida escopo e papéis depois do `FOR UPDATE` e nega pedido ausente/NULL com `b2b_phase1_scope_denied`, sem chegar a `payment_terms_not_defined`;
- mantém a negação explícita `C2_ACCOUNTING_PENDING` e todos os 38 gatilhos reais habilitados nas chamadas.

Pinos principais confirmados pelo auditor no relato LIVE e reproduzidos nos corpos locais:

| Função | MD5 |
|---|---|
| `public.b2b_phase1_order_visible(uuid)` | `8812508716f279a88e3d5a31b15621d8` |
| `platform_private.b2b_phase1_order_visible(uuid)` | `8504f07fbc3a7975accf919f386d00eb` |
| `public.has_role(uuid,public.app_role)` | `4d90e93d521a4819d9085f28d742030f` |
| `platform_private.has_role(uuid,public.app_role)` | `c5af5b55de6d79da9b73a33948746ae2` |

Os demais corpos, owners e ACLs vêm da captura LOCAL `delivery-atomic-hardening-20261030/capture/current.json`; ainda precisam ser confrontados com LIVE pelo auditor. Captura local não é presumida como produção.

## Resultado

`../test-adjustment-candidate.py`: **60/60, exit 0**. Evidência estruturada: `../evidence/adjustment-candidate.json`; saída/código: `../evidence-adjustment-candidate-review.*`.

Cobertura executada:

1. hashes exatos dos 14 corpos de Auth/escopo/dependências e ausência de localização de pinos;
2. PRE/POST, drift de corpo do writer e de núcleo privado, drift real de owner e ACL, rerun e rollback;
3. pedido inexistente e NULL, C2 pending, estrangeiro validado e estrangeiro legado sem efeitos;
4. revogação durante lock de papel administrativo, perfil, vínculo organização-parceiro, lease de primeiro acesso e feature `pedidos_b2b`;
5. positivo validado com superadmin cumulativo + papel administrativo, positivo legado no escopo autorizado e comprador sem papel financeiro negado;
6. estado integral preservado em todas as negações, histórico preservado no rollback e 38 gatilhos ativos no início/fim.

A guarda externa real impede criar pedido externo quando existe organização apontando para o parceiro. Por isso o positivo validado não força um admin comum por uma fixture incompatível: usa o ator fictício superadmin+admin já existente. O admin comum é exercitado no legado, após as fixtures externas, sem alterar o guard nem ampliar acesso.

## Limites

Auth por GUC, `auth.jwt`, esquema, vínculos, assinatura e features são fixtures sintéticas. Os corpos das funções de autorização são reais capturados, mas isso **não prova JWT, RLS, PostgREST, Storage, dados ou fluxo hospedado**. Não houve teste de implantação nem aprovação de produção. B3, B4 e os resultados físicos downstream permanecem separados e não foram reabertos.

Arquivos desta revisão: `matrix.csv`, `candidate-from-captured.diff`, `manifest.json` e `SHA256SUMS`. Os SQL revisáveis continuam em `../01-pre.sql.readonly` até `../04-rollback-deny.sql.review`.
