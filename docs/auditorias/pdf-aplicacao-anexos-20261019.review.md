# PDF de aplicações — candidata restrita

## Base e homologação informada
Base publicada `f91728b513a6672e6c09c5cc4b49385b9d5549d8`.
Auditor independente informou homologação **REAL limitada** de recibos/financeiro/admin:
PDF autenticado A salvo/renderizado; busca B `REC-2026-000001` vazia;
inativação A12:07:39Z retirou Baixar PDF, retry negado, restore12:08:05Z retornou somente Preparar PDF;
B12:08:25Z/retry negado/restore12:08:56Z com filtro limpo; estabilidade observada96s depois.
Ambos ativos, papéis originais e sessões preservadas. Não é JWT direto, prova HTTP adversarial ou auditoria global.

## Menor delta e todos os callers
- `src/lib/pdfAplicacao.ts`: leitura atual autenticada de aplicação por id/tenant e RLS antes de exportar snapshot; evidências pela relação existente; erros/negação/ausência não geram PDF parcial.
- `src/components/aplicacao/AplicacaoCard.tsx`: únicos dois callers encontrados (`handleDownloadPdf`, `handleSendEmail`). Ambos usam `useStorageAccessScope` sobre snapshot/recurso/dose, capture antes da operação, antes/depois de cada await e antes de output/download/sucesso. Troca de ator/tenant/roles/epoch/recurso e unmount abortam, limpam UI; lock síncrono único bloqueia duplicação local. Confirmação idêntica não altera recurso.
- Timeout total15s, transporte canônico com timeout15s/20MiB por arquivo/60MiB total; até24 vínculos, download sequencial. Nenhum retry automático, fallback signed/public, novo cliente Supabase, cache paralelo ou gate habilitado.
- `jsPDF.save` foi inspecionado: agenda clique via setTimeout0 sem fence. O mesmo comando Baixar PDF usa agora output Blob + anchor síncrona cercada imediatamente antes do clique, com URL local revogada no finally. Nenhum popup/remoto/fluxo adicional. Bytes já baixados continuam não revogáveis.
- Envio preserva a Edge existente, signal e fence antes/depois; **fonte local enviar-pdf-aplicacao permanece fechada503 STORAGE1_PDF_CONTRACT_UNAVAILABLE** antes de leitura/credenciais/transporte. Teste de sucesso fake prova wiring, não envio real nem reabertura. Timeout cliente não garante cancelamento de efeito já executado por servidor.

## Contratos inspecionados, não presumidos live
Writer `caminhoEvidencia` grava `cliente_id/aplicacao_id/uuid.ext`. Storage `storage1_application_allowed` aceita clienteUUID/aplicaçãoUUID/basename segura, resolve OS/cliente/tenant e `can_user_access_aplicacao`; privada/RLS são autoridade. A validação local espelha sintaxe e origem, não autoriza.
`aplicacao_evidencias.aplicacao_id` é origem persistida; `versao_origem_id` mantém herança na retificação. Download usa path da evidência vinculada autenticadamente, comparado à origem, **não reescreve para versão atual** nem exige UUID no basename onde o contrato permite outro nome seguro. HEIC/HEIF permanecem metadados válidos; jsPDF pode não decodificar e o PDF então falha explicitamente, sem evidência omitida silenciosamente.
Logo é locator público emitido por AparenciaTab: URL canônica `/storage/v1/object/public/logos/platform/<arquivo>`; extrai path seguro PNG/JPEG/WebP e baixa via SDK autenticado. Não fetch de URL fornecida, redirects, dataURL ou signedURL. Branding externo/legado incompatível exige revisão, não fallback arbitrário.
Tipos gerados locais antecedem organization_id em aplicações; leitura usa select* e filter explícito, valida linha real sem regenerar binding/tipos. Preflight exige coluna real e contratos. Evidência com relação oculta/null falha fechada.

## Validação
Resultados finais e recibos em `scripts/authz-cache/application-pdf-release/validation-receipt.json`.
Testes com componentes/scope/gerador reais, transporte e relógio controlados: positivos sem foto e com logo/foto herdada; ambas ações; tenant/id errado, RLS negada, URL/path inválido, contagem/tamanho, offline, abort/timeout, epoch/ator/tenant/papel/recurso/snapshot/unmount, late query/bytes/Edge, clique final e limpeza URL. Não são JWT/RLS hosted ou login real.
Skill PDF: fixture PNG inicial tinha CRC inválido e foi substituída por PNG sintético válido. Duas páginas do PDF gerado pelo jsPDF real foram convertidas por pdftoppm e inspecionadas: sem sobreposição/corte, tabelas/rodapés legíveis; foto/logo são blocos sintéticos verdes, não evidências reais. Nenhum arquivo comercial foi exportado.
Suíte ampla não repetida; **seis falhas históricas** seguem documentadas e não foram recertificadas/ocultadas neste recorte. Build automático OK não certifica typecheck: não há recibo independente de tipagem. Esclarecimento e entradas/config/hashes em `scripts/application-access-integrity/typecheck-independent.md` e `independent-inputs.json`; recibo histórico preservado não significa PASS de tipos.

## Pacote e rollback
`scripts/authz-cache/application-pdf-release`: snapshots candidata e rollback byte-exatos da base, manifest/SHA256, stage externo com validação integral antes de qualquer escrita e destino vazio; rollback restaura somente PDF/card e lista remoção do teste novo, nunca autoinstala. Gates/monitor/probe/recibos/hooks/Edge/fontes dos paths protegidos por hashes exatos.
Preflight SELECT-only inventaria colunas/FKs/ACL/owners/search_path/corpos/MD5/RLS/policies/triggers/buckets, sem linhas de clientes/perfis. **Não executado**; auditor deve comprovar ref `swzpzcwiasxmjutrmvkm` antes de conexão e comparar resultado completo. Ausente/divergente/Cloud => interromper. Sem DDL/SQL hosted/deploy/publicação/reload/login/perfis/pagamentos.

## Caminho real posterior e fixtures
Atualização12:27: auditor informa aplicações/evidências produção vazias e RPC salvar fechada; homologação PDF bloqueada, sem criar fixture hospedada/inserts. Correção revisável do helper em aplicacao-helper-integridade-20261019.review.md, não aplicada.
Sessão financeiro A na preview e administrador B publicado não foram alteradas. Não pedir novo login. Caminho existente `/aplicacoes`: abrir aplicação na tabela, Detalhes da Aplicação → Baixar PDF. `/portal/aplicacoes` reutiliza mesmo card para produtor legitimamente vinculado.
Financeiro A **não é positivo técnico presumido**: se guard/RLS não autorizar aplicações, deve negar; não ampliar papel ou permissão. Admin B pode testar aplicação própria existente autorizada, jamais A. Positivo A exige fixture já autorizada de aplicação/OS/cliente/tenant com foto legível em bucket privado e vínculo canônico, e ator técnico autorizado na sessão disponibilizada pelo proprietário/auditor; foto herdada exige revisão anterior e vínculos preservados. Ausência dessas fixtures é blocker nomeado, não autorização para criar/escrever.
Prova independente: baixar/renderizar sem pagamentos/recibos/envio real; requests Storage autenticados e cross-tenant negado; inativação/retry/restore, mudança de recurso e retorno tardio sem download. Sessões financeiras atuais não homologam automaticamente aplicação. Nenhum E2E autenticado novo foi realizado nesta execução.

## Inventário global v6 — NO-GO, sem implementação
Estado local em `scripts/authz-cache/v6-status.review.md`, `v6-writers-catalog.review.md`, contratos1249/1252 e `v6-missing-contracts-readonly.sql`: material histórico, não postflight atual.
- Já fornecidos corpos/ACL/55triggers/287colunas/constraints/índices parciais e seis writers comuns: não relistar como ausentes. Mudanças aplicadas externamente dos helpers B2B, integrity financeiro e guard88 recibos não devem ser reaplicadas ou consideradas prova global.
- Ainda exige closure atual de writers de organizações/assinaturas/invites/tickets/overrides/papéis/vínculos/principal/vigência, SQL dinâmico/grants diretos, filhas audit/recalc/default e índices/tickets fora do recorte. Assinaturas não provam ordem interna. Inversão profile→roles→singleton vs common singleton→profile→links exige provas multi-statement/nested/cascades, concorrência/deadlock/ABA sem stubs autorizadores.
- Revisões monotônicas transacionais/snapshot antes-depois dependem também de invites/access_valid_after/JWTiat, entitlements e fronteiras reais de vigência. STABLE/now transacional não garante relógio de chegada; orçamento conservador15s desde início e fronteira server exigem contrato/prova real. Nenhum resolver/volatilidade alterado.
- Storage operação HTTP/grants/helper bodies/drenagem de signers antigos e clientes antigos precisam inventário atual. Recibosv88 foi byte-revisado externamente; não certifica signer das demais Edges/report/fiscal/entrega. `entrega-termo-pdf` guard final permanece pendência independente. Buckets historicamente ausentes order-attachments/entrega-termos precisam confirmação atual sem criação/remapeamento. URLs antigas/bytes não revogáveis; T0/drenagem não provados.
Não habilitar v6/Blob/global, não alegar revisão monotônica/ABA universal, revogação instantânea ou timers garantidos em browser suspenso; monitor único/lease e refresh B2B publicados preservados byte-exatos.