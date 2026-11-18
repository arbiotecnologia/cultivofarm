# Conclusão aditiva após auditoria root — 18/11 02:49 UTC

## HML aplicada: relato recebido, não reaplicar
O root informou baseline **12a580416 instalado/released somente em vrlcdwmlytukrjezrrnf**, 26 verificações Auth reais (13 básicas + 3 leitor/JWT antigo + 10 relações/quota), IA real Embrapa com gerar/aplicar/salvar/reabrir fontes e navegador real desktop/mobile PASS, 390 sem overflow. Produção e hosting não alterados. Esses resultados são **evidência externa relatada**, não execução hospedada deste agente. Superam os bloqueios antigos de sessão/DSN/IA do baseline, mas não homologam estes novos deltas.

## Correções entregues
1. `tenant_microorganism_ficha_read_v1`: `catalog_tenant_actor('read_catalog')` equivalente à raiz, preserva leitores e exige catalogo_precos; não usa mutate. Leitor permitido/feature revogada/reativada exercitados localmente.
2. save_v1: valida fonte_url opcional com helper privado HTTPS, sem credenciais, espaços/controle/percent-control/backslash/localhost/local. Rejeição aborta raiz, fonte e recibo; sem sanitização silenciosa. UI valida antes de dispatch; SourcesManager e ficha só tornam clicável URL com whitelist, exibem legado inseguro como texto. HTTP recusado consistentemente com label HTTPS.
3. Labels IA com acentos; Tipo Bactéria/Fungo/Levedura/Consórcio; selects fonte_tipo/nivel_confianca/alvo_tipo com valores das constraints reais capturadas; seleção cultura inclui cultura_nome canônico.
4. Relação ainda aberta bloqueia salvar/trocar seção, com mensagem para aplicar/cancelar; fechar exige confirmação. Aplicar faz staging, Salvar ficha continua única transação CAS. Não perde campo digitado antes de Aplicar.
5. `build-edge.py`: montagem completa determinística, binding.ts com const explícita por ref, check SUPABASE_URL intacto, nenhuma mutação Deno.env em runtime, nenhum default aberto. Copia modelos gerados e resolve specifier npm na montagem; Deno check executado fora da árvore/dependências do projeto. Docs Edge HML-only, IA ambos refs somente como preparação offline, sem deploy.
6. SQL Python escreve `encoding='utf-8', newline='\n'` no assembly original (somente geração, SQL baseline intacto), assembly documentos e delta; sem repinar após CRLF.

## Pins e implantação incremental revisável
- Read PRE `0c6dcc0a3fad6114c7cbf125544abc3f` → POST `be59e7ff911d3c9f1ba76b9083b64539`.
- Save PRE `52ba09db7c85a5cf028ddbb5951652a8` → POST `5a7bd63edadf168148edc2b6f6e0c70e`.
- Helper novo POST `4e5e00115708d99a2d8a8da921396b5a`, EXECUTE privado fechado.
- `01-pre/02-install/03-post/04-rollback.sql.review`: preserves OIDs/ACL through CREATE OR REPLACE, old/new pins, exact rerun POST, rollback REVOKE-only sem restaurar bypass ou URL insegura.
- **Ordem recomendada HML:** delta documentos sobre baseline12 (captura seus pins antigos), depois root-audit-delta. Caso correções sejam aplicadas primeiro, não repinar cegamente documentos: revisar nova composição/captura do save. O root escolhe/valida a ordem exata, nenhuma aplicação pelo agente.
- IA: `python3 scripts/microorganism-ficha-20261118/build-edge.py --ref vrlcdwmlytukrjezrrnf --service documentary --out /tmp/review-ai`.
- Documentos: mesmo comando com `--service documents`. Implantar somente após revisão pelo root; verify_jwt conforme contrato revisado, JWT em código também validado.
- Nunca reexecutar o instalador baseline para aplicar estas correções. Preparação para publicação não autoriza publicação.

## Evidência objetiva executada localmente
- Catálogo **1032/1032 em 55 arquivos**; inclui 11 URLs negativas/positivas e 2 relações/cultura/pending, regressões IA/ficha/documentos.
- Correção PG descartável **17/17**: feature negada leitor, URLs maliciosas, atomicidade, HTTPS persistido, rollback fechado; actor/root capturados, Auth/feature/schema sintéticos.
- Documentos PG **32/32** preservados; Edge documentos **13/13** e IA **9/9** sintéticos; Deno check dos dois bundles montados PASS.
- Chromium local **1280×1800 / 390×844**: IA/fontes reabertas e anexar/consultar/segunda versão/reabrir; zero pageerror/overflow, um diálogo. Auth/transporte interceptados — não hosted.
- Typecheck automático exit 0 (`f4c33a99-ccad-4a70-82a7-85693be182b0.log`) e build automático OK; nenhum build/typecheck manual duplicado. Evidências locais em evidence/.
- Navegador adicional desktop/mobile confirmou Salvar bloqueado enquanto relação não aplicada, texto pendente preservado, javascript rejeitado e HTTPS aplicado ao rascunho; ensaio em browser-pending.py.

## Gaps reais restantes
- **Novo delta documentos:** bucket privado/configuração Storage HML, captura integral/ACL/guards, instalação/release/Edge e suite JWT/Storage/browser real pelo root continuam pendentes; código e hosted-qa.py prontos, não exige DSN do agente.
- **Correções read/URL:** executar PRE/POST e negativas reais feature/URL na HML após aplicação; testes locais não substituem JWT real.
- **Montagem Edge:** revisar/promover o bundle exato gerado na HML; IA real baseline já comprovada pelo root não certifica uma nova implantação.
- Fiscal/técnico: nenhuma aprovação, classificação ou alteração real criada. Produção27 micros/perfis/status preservados por ausência total de acesso/escrita do agente.

O commit anterior **d7dc4def1** mantém documentos completos; este complemento é um novo commit final porque amend/rebase não são permitidos, sem apagar/reempacotar história.
