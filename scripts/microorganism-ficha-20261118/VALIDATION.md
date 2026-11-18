# Evidências exatas

- `tsgo --noEmit -p tsconfig.app.json`: saída vazia / código 0.
- Build automático: últimos registros `build OK`; build não executado manualmente por regra do ambiente.
- Catálogo: 51 arquivos / 975 testes PASS antes das últimas regressões aditivas; rodada final registrada a seguir.
- Focais: 3 arquivos / 28 testes PASS; fiscal compartilhado: 2 / 11 PASS.
- PostgreSQL 17.12 descartável: 19/19 componente, actor/root capturados reais; Auth, features, schema e uma dependência receipt reconstruída sintéticos. Não é cadeia JWT/RLS hospedada nem prova integral de triggers.
- Deno Edge: 6/6, auth/transport interceptados; deno check PASS. Sem deploy.
- Pesquisa real SDK `openai/gpt-6-astra`, web_search, espécie pública Bacillus subtilis: executada, retornou fontes Embrapa e Infoteca e resumo explícito geral; evidência JSON. Sem cliente, empresa ou chamada Edge autenticada.
- Playwright componentes reais + Auth/transporte interceptados: 1280×1800 e 390×844; salvar/reabrir cepa e fonte, 1 diálogo, sem overflow e sem pageerror. Screenshots inspecionadas em /tmp/browser/micro-ficha. Não é prova hospedada.
- Prévia pública `/base-tecnica`: primeira captura 1,8s vazia; inspeção posterior encontrou redirecionamento/login nos logs. Sem acesso autenticado, não certificada; não alteramos guards para contornar sessão.
- Produção: apenas metadados read-only. Preservação dos 27 micros é objetivo e roteiro de hash PRE/POST, não uma verificação de dados executada nesta sessão.

Rodada final: 54 arquivos / 997 testes PASS; typecheck saída vazia, exit 0.


## Rodada de continuação — executada nesta sessão
- Catálogo completo: 52 arquivos / 997 testes PASS, maxWorkers=2 (02:27 UTC).
- Focais: 2 arquivos / 33 PASS; global sem reader próprio, schema/tenant/revisões, concentração, candidate_key e disputa save/IA.
- PG descartável: 42 PASS; assemble idempotente fechado/aberto, revogação durante lock comprovado por pg_blocking_pids, replay concorrente (um root/recibo), atomicidade de falha child tardia, concentração sem conversão, quota2 e isolamento, trigger audit real capturado.
- Edge: 9 PASS com Auth/transporte sintéticos; corpo acima de24.000 sem content-length, quota429 antes provedor, binding explícito HML/mismatch.
- Browser real components / transporte+Auth interceptados: 1280x1800 e390x844, cepa/fontes salvar-reabrir, um diálogo, sem overflow/pageerror; screenshots inspecionadas. NÃO hosted.
- HML conexão: recusada antes de conectar por binding STAGING divergente. Nenhuma captura/pin HML ou prova JWT/Storage reportada como executada. Scripts Auth HML preparados independentemente de sessão browser.
- Arquivos de capture production são catálogo real read-only; marca [REDACTED] impede tratá-los como roundtrip SQL integral. Assemble local-post pins são determinísticos do descartável, não catalog POST hosted.

Validação final: typecheck exit0; deno check exit0; Edge9/9; focais incluindo cadastro39/39; build automático02:29:07 build OK; navegador repetido1280/390 sem erro/overflow. git diff --check exit0.
