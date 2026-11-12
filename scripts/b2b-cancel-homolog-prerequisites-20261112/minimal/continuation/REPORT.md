# Continuação 01:41 — catálogo recebido, avanço fechado e bloqueio focal

Alvo exclusivo **vrlcdwmlytukrjezrrnf**. A instalada/POST aprovado é relato do proprietário; nenhuma chamada remota foi realizada e A não foi alterada.

## Captura e resultado

`capture/catalog.json` foi decodificado offline sem erros de gzip/base64/JSON: 11 estruturas completas, três definições, sete event triggers, 150 entradas de funções e 316 entradas de tipos. SHA-256 **0b960b4d884b70065820198cc9be762c8484df577af420846e3622a56dfb5923**. As três definições coincidiram com os MD5 solicitados em `pg_get_functiondef` local.

Foram gerados **B/C/D PRE + INSTALL + POST + rollback deny-only**, todos transacionais com marcador homolog/OFF, cron zero, pins das estruturas/ACL/constraints/índices/policies/triggers/definições/event triggers capturados, timeout e invariância da autoridade existente. Não há GRANT cliente, substituição de writer público, backfill, atualização de dados de negócio ou habilitação operacional.

- **B:** somente cinco relações canônicas privadas de proveniência/alocação/permissões. Não instala o motor B4 ou a condição B3 inteira.
- **C:** permissões fiscais, snapshots, close-pending; adiciona `receivable_payments.idempotency_key` e índice único por parcela/chave, `protocol_c_stat` e `b2b_document_id` com FK na relação canônica e unicidade por documento. Mantém `created_by NOT NULL`, o índice legado por pedido e todos os guardas existentes. Sem preenchimento retrospectivo de chaves.
- **D:** capacidade e comando residual **privados, sem chamador/grant**, helper fiscal privado e gate OFF/allowlist vazia. A capacidade usa **aguardando_fiscal/faturado_parcial**, não `aprovado_previsto`; não transforma estados existentes. Pendência verdadeira, transmissão em curso e faturamento total continuam bloqueando.

Esses segmentos são **artefatos fechados para revisão**, não a implantação operacional B–E concluída. O roundtrip do catálogo integral do alvo ainda não foi comprovado; executar os PRE no alvo é atribuição do auditor, não foi realizado aqui. D permanece sem endpoint público e não se deve montar a ação como funcional.

## Dependência concreta que impede a fixture hospedada

`accounts_receivable` tem **11**, não dez, triggers: inclui `a00_homolog_validation_no_receivable`, **BEFORE INSERT FOR EACH STATEMENT**, executando:

`platform_private.homolog_validation_block_receivable_insert()` — MD5 **1b7e286b1391c986604df2b171025c62**.

O corpo desta função não veio em `definitions` e não existe nas fontes locais pesquisadas. Um ticket por título validado em BEFORE ROW não basta para uma barreira de statement; desabilitar/remover o trigger ou assumir um bypass seria alterar a segurança de homolog. Uma reprodução declaradamente sintética mostrou que até `INSERT ... SELECT ... WHERE false` pode ser barrado antes das validações de linha. Isso demonstra a ordem, **não a semântica do corpo real ausente**.

**Única consulta focal necessária agora:** `E-required-statement-guard.sql.readonly`, somente assinatura/MD5/owner/ACL/config e definição revisada dessa função. Não solicita dados, usuários, segredos nem novo inventário geral. Se ela proíbe qualquer recebível, será necessário delta homolog-only específico com ticket privado vinculado à intenção e manutenção da negação fora da fixture; nenhum relaxamento foi entregue sem conhecer o contrato.

E e a fixture fiscal hospedada estão **BLOCKED**, não instaláveis. `fixture_hosted.py` é fonte de roteiro com barreira explícita antes de qualquer transporte; flags cliente não liberam simulação. Não contém criação SQL de NF autorizada/título/parcela/pagamento final, nenhum usuário novo e nenhuma alteração de papéis. O pagamento futuro exige RPC canônica, transação separada e registro preservado; o provedor futuro deve ser privado, sem IO externo e sem EXECUTE de service-only para sessões.

## Outros conflitos resolvidos ou delimitados

- H6b presente consulta uma coluna `idempotency_key` inexistente: C corrige o suporte estrutural sem reescrever histórico; ainda não homologa o cálculo/escopo de H6b nem instala o pagamento candidato.
- H13/B4 exigem `protocol_c_stat` e proveniência por documento: C fornece somente estrutura. A ponte/allocator e condição/origem ainda precisam composição executada depois da revisão do statement guard; seus históricos não foram transplantados.
- Begin capturado usa `company_fiscal_settings WHERE is_active LIMIT 1`: **não foi promovido** como simulação multiempresa segura. A futura integração deve usar configuração exata da NF, ator/tenant antes dos locks e reautorização após waits.
- Prepare capturado verifica ator/empresa antes do advisory, sem nova reautorização depois: mantido byte-exato apenas como captura, **não** certificado ou reinstalado.
- Aprovações H4b podem liberar `ready_for_production`/notificações: não foram acionadas ou substituídas. O caminho hospedado não pode usar esses efeitos para fabricar readiness fiscal ou física.
- Não há necessidade demonstrada de clone limpo; o caminho mais curto é A existente → revisão dos segmentos fechados B/C/D → corpo focal → delta de barreira + composição de comandos/callback e adapter → teste real. Um clone separado seria outra decisão/alvo, não foi criado.

## Verificação realizada

- **22/22** checks PostgreSQL locais: três hashes reais fornecidos, payloads exatos B/C/D com POST fechado, rollback exato, PRE integral negando catálogo reduzido, ACLs negadas, gates OFF, estado `aguardando_fiscal` R$20→0, CAS obsoleto negado, evento único e três estados impeditivos negados, nenhum título/pagamento fabricado, marcador incorreto negado.
- **16/16** testes existentes de UI isolada: Financeiro localiza por NF/empresa e exibe pedido/título/parcelas/recebimentos; cancelamento permanece por capacidade. Nenhuma mudança na UI original ou em rotas.
- Tentativas 001/002 falharam por enums ausentes no catálogo reduzido; logs preservados. Tentativa 003 usa todos os enums capturados e passou. Asserções não foram enfraquecidas.
- Testes novos da fixture exigem negação no alvo incorreto, tentativa incerta e adapter ausente, inclusive com flag cliente forjada.
- Último build automático observado OK. Typecheck separado não realizado; nenhuma suíte completa do projeto ou sessão real executada.

**Costuras:** tipos/colunas capturados em shells sem defaults/constraints/guards de negócio, Auth/papéis/settings/features sintéticos, payload A sem seu PRE, remoção da FK pai somente no teste descartável do contrato de estado, barreira de statement sintética. Não é roundtrip integral homolog, prova JWT/RLS/PostgREST/Storage, reconciliação paga real ou homologação do provedor.

## Caminhos e aplicação pelo auditor

Pasta: `scripts/b2b-cancel-homolog-prerequisites-20261112/minimal/continuation/`.

Cada `*-install.sql.review` repete PRE e POST na mesma transação; executar os arquivos independentes, não concatenar todos. Usar a conexão já configurada exclusivamente para homolog, `psql -X -v ON_ERROR_STOP=1 -f <arquivo>`, sem DSN/segredos no histórico. Rollbacks retêm relações, colunas e histórico e somente revogam acesso já fechado; não são reversão estrutural. Não reaplicar A.

Hashes dos SQL e fontes em `SHA256SUMS`; `manifest.json` distingue artefatos fechados de E bloqueado e registra os SHA das fontes canônicas. **Não aplicar para obter cancelamento funcional antes de fechar E e a composição operacional.** Nenhum remoto, publicação, emissão, envio, cobrança ou operação física.