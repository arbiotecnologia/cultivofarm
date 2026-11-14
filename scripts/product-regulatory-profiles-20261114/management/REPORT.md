# Gestão de dossiês pela empresa proprietária — 14/11/2026

## Correção E2E 02:46 — atesto e retomada
- Causa confirmada por metadados hosted: service_role possuía EXECUTE no core, mas não USAGE em platform_private; a fachada SQL INVOKER falhava antes do atesto. O mesmo defeito atingia cancelamento final e aliases antigos.
- Aplicada `20261114024720_4946b45d-4c5f-4f1d-9fa7-79ab75270eb0.sql`: quatro fachadas específicas de atesto/cancelamento agora DEFINER, search_path vazio, conferem `platform_private.require_service_role()` e delegam aos cores existentes. EXECUTE exclusivo service_role/postgres; anon/authenticated negados. Nenhum USAGE geral concedido. Demais wrappers de acesso/preparo/finalização/pendentes continuam INVOKER com contrato tenant. O alias antigo cancel_begin mantém ACL anterior; não é ponte de atesto/limpeza final.
- Prévia: Atualizar relê explicitamente reservas antes do detalhe/contexto; nova montagem consulta reservas duráveis, sem depender de memória do upload. Concluir/Descartar exigem ACK COMMITTED/CANCELLED; ausência de confirmação mantém a tentativa. Carregamento da lista é distinguido de falha.
- Executados 24 Vitest (14 gestão + 10 leitura), todos PASS: Atualizar encontra reserva posterior, remount preserva recuperação, resume usa a mesma chave sem prepare, descarte não confirmado mantém reserva. Transporte simulado, não sessão real.
- Executadas 9 verificações PostgreSQL PASS com SET ROLE real, ACL e guard canônico espelhados em fixture descartável: core direto negado sem USAGE, ponte service-only acessível, identidade inadequada negada, atesto persistido, limpeza bloqueada enquanto bytes existem e concluída após remoção sintética, clientes negados nas quatro pontes. Migração real executada intacta no fixture. Não é prova JWT/Storage hosted.
- ACL hosted pós-migração confirma quatro DEFINER com search_path vazio, anon/authenticated sem EXECUTE e service_role com EXECUTE; service_role continua sem USAGE privado. Build automático OK em 02:48:22 UTC. Migração sem novos achados, 497 anteriores permanecem.
- Nenhum rascunho, objeto ou reserva de QA foi consultado, alterado, atestado, retomado ou removido pelo agente. Edge existente não exigiu alteração/reimplantação; frontend não publicado. Retomada autenticada do PNG e recálculo real serão validados pelo usuário em sua sessão.

## Aplicado
Destino: `swzpzcwiasxmjutrmvkm`. Entradas: Base Técnica > Produtos e Fiscal > Perfis Fiscais > Produtos, ação **Gerenciar dossiê**, mesmo detalhe. A antiga aba da plataforma foi retirada da prévia. Wrappers antigos foram preservados para compatibilidade, mas agora respeitam o proprietário. Superadmin isolado é negado; edição pelo contrato catalog_tenant_actor/mutate (administrador/gestor próprios), leitura pelo contrato da empresa. Revisão/publicação mantêm alçadas anteriores e recebem verificação prévia de propriedade.

Cobertura explícita de vários microrganismos reais da empresa, versões individuais por produto, histórico, abrangência opcional do documento, cálculo de ROTULO por toda a cobertura. Rascunhos: dados/checklist/submissão; validados não editáveis. Legados não recebem produto automaticamente.

Upload privado fiscal-regulatorio (20 MiB, PDF/PNG/JPEG): reserva exata anterior aos bytes, verificação servidor de formato/hash/tamanho, atesto service-only, finalização autenticada idempotente. Reserva incompleta pode reenviar o mesmo arquivo/retomar/cancelar, sem declarar documento concluído; após falha a lista de reservas é relida. Abertura binária autorizada antes/depois dos bytes, sem URL assinada persistente, cache privado no-store. A abrangência documental é novamente validada na finalização.

## Migrações efetivamente aplicadas
- 20261114023631_6b533f6a-83da-49a4-beb3-9181413c8017.sql — escopo proprietário, compatibilidade, cobertura e contenções.
- 20261114023655_639c12da-77ef-415f-877a-aeebf44c8cc2.sql — gates de transições.
- 20261114023749_db6580fa-6eb9-4117-b42a-f7562a404be1.sql — versões, documentos históricos e ROTULO.
- 20261114023958_134db9bc-9934-4c15-a875-84010d0eb559.sql — fachadas storage INVOKER.
- 20261114024308_ee567c0d-bc66-4c6a-9cad-836966e30d03.sql — cobertura na finalização, numeração por produto e fechamento antecipado de escritores legados.
- 20261114024405_9770e7ad-7c11-48ce-b1aa-4074b17f2601.sql — numeração compatível dos legados.
- 20261114024429_a837a610-4b72-49b2-bc76-2ded29d02917.sql — propriedade antes de revisão/publicação.
Uma tentativa de 24405 falhou com 42883 por assinatura de função incorreta; corrigida usando assinatura encontrada no catálogo. Nenhuma alteração parcial dessa tentativa é considerada aplicada.

Edge product-regulatory-document implantada: source SHA-256 reportado pela ferramenta `953813c148fa220dd640f104a3a3ff102802dab14d654e50a98cef5ca4dfaca5`; arquivo index.ts SHA-256 `03bb748966db3fd0d67ef0232261d47997997a3f568090982cf5add983047ef4`. POST sem sessão retornou 401. Não prova execução autenticada do código remoto.

## Testes executados
- 21 Vitest PASS (11 gestão + 10 leitura): cobertura explícita, leitor próprio readonly, CAS, revogação em tela aberta, vazio, formato/limite/hash.
- 26 verificações PostgreSQL descartáveis PASS: isolamento A/B, superadmin negado, criação única, cobertura, CAS, reserva/finalização/atestação, ROTULO parcial/completo, histórico/versão e permits. Runner: run-tenant-local.sh. Identidade e dependências são stubs sintéticos; executa deltas 23631/23655/23749. Não certifica JWT/RLS hosted, revisão/publicação completa ou as últimas deltas 23958/24308/24405/24429.
- Deno 4/4 PASS e deno check PASS para função.
- Compilação/typecheck automáticos: build OK, último sinal 02:45:14 UTC.
- Inspeção hosted de ACL: wrappers tenant INVOKER, authenticated sem atesto/cancel final; bucket privado 20971520 bytes. Nenhum novo achado nas migrações; 497 anteriores permanecem (90 RLS sem política, 2 definer público, 404 definer authenticated, 1 proteção de senha desativada).

## Limitações específicas
Sessão external_unmanaged: sem prova autenticada de navegador, upload/abertura privada reais ou revogação HTTP/JWT entre tenants. Playwright sem sessão exibiu página vazia e zero pageerror, não comprova o fluxo central. Nenhuma fixture hospedada foi criada; dados reais QA/Bombarbio não foram consultados/alterados neste recorte de validação. Concorrência Storage distribuída, cancelamento remoto e contratos completos de revisão/publicação ainda exigem homologação autenticada. SQL local preserva stubs explícitos; não confundir com provas de produção.

Frontend não publicado; fiscal, emissão, comunicação e cobrança não alterados. Usuário deve validar as duas entradas, criação/edição, upload/retomada/abertura, histórico e revogação em suas sessões autorizadas antes de publicar.
