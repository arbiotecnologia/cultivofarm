# Últimos 16 — fechamento local

Somente IDs 3,6,7,9,13,15,26,37,38,42,53,54,87,88,89,90; os 88 anteriores e #116 não foram repetidos.

## Resultado
- 15 IDs com contextos locais qualificados; #9 inacessível no consumidor atual, comprovado por fonte e consulta montada. #3 fechado pela entrada comercial/vendedor (id3/REPORT.md), 36 cenários novos e 86 testes; build novo capturado.
- SUMMARY.json fornece perfis, larguras, motivos e arquivos por ID; COUNTS.json reconcilia os 116. Montagem isolada e consumidor contextualizado são explícitos; não são navegação integral nem autorização de produção.
- Guardas originais: guards-3/26/87.json; app-guards-38.json contém os 15 perfis em duas larguras (14 positivos e 16 negativos). Contextos técnicos frescos, produtor vinculado e parceiro são respostas locais; zero banco/SQL/publicação.
- #38 Financeiro em montagem isolada não prova acesso a Microrganismos; aba Financeiro limitada a Produtos. Portal B2B abre PartnerFichaDrawer/FichaProdutorDrawer, não #38/#42.

## Correções comprovadas
- #53: botão personalizado abria diálogo sem gerar PDF. Handler compartilhado gera uma vez; título e ações empilháveis. initial-context-53.json preserva antes, context-53.json registra 10 positivos após. iframe/blobs confirmados; Chromium headless não comprova renderização interna do documento PDF.
- #37: ação Volumes ausente no cartão móvel de Produtos; mesmo leitor agora acessível, sem mudar permissões. Tabela com mínimo de largura e rolagem local evita cabeçalhos quebrados; before-positive-context-37.json preserva estado anterior. Leitura positiva de embalagem e última ação em nove perfis × duas larguras; escrita não executada.
- #6: histórico com changed_at/action/diff/old_data corretos; última linha lida, dois perfis × duas larguras.

## Verificação
49/49 testes em 3 arquivos (regression.log/exit), incluindo geração única com trigger padrão/personalizado e revogação de blob. Último sinal legível automático antes da falha de I/O: build OK em 15:30:53 UTC. Leitura posterior do log retornou Input/output error; não foi possível reconfirmar o sinal final. Nenhum build/typecheck manual executado (harness automático).

## Reprodução
Executar na raiz, servidor local 8080, fixtures locais e egress bloqueado:
```sh
for n in 0 1 2 3 4 5; do python3 scripts/responsive-layout-116/last16/run.py "$n"; done
for n in 0 1 2; do python3 scripts/responsive-layout-116/last16/consumers.py "$n"; done
for n in 0 1; do python3 scripts/responsive-layout-116/last16/mobile.py "$n"; done
python3 scripts/responsive-layout-116/last16/app-guards.py 0
bun run test -- src/test/visita/pdfPreviewTrigger.test.tsx src/test/catalogo/tenantProducts.realClient.test.tsx src/test/catalogo/unifiedProducts.realClient.test.tsx --maxWorkers=2
```
Checkpoints existentes evitam repetição; remova apenas o checkpoint do ID que desejar retestar. Módulos instrumentados reaproveitados de /tmp/browser/responsive-116/modules: ausência deles exige preparação pelo harness existente; não considerar o comando isolado um pacote autossuficiente. Evidências apenas scripts, sem pasta public.

## Atualização final #3
Ver id3/REPORT.md: matriz reconciliada 103 completos locais + 1 staff já documentado + 12 N/A = 116, zero gaps locais. O erro anterior de I/O foi superado por nova captura do build.
