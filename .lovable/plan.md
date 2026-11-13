# Catálogo > Serviços com faturamento e NFS-e

## Situação real encontrada (produção swzpzcwiasxmjutrmvkm, somente leitura)
- Migração `20261113150414 scope_service_fiscal_profiles_to_issuer` está no histórico remoto. Será versionada como cópia de referência em `scripts/service-catalog-nfse-20261113/`, sem reaplicar.
- Não existe cadastro comercial de serviços: `service_fiscal_profiles` é hoje o único registro (fiscal), sem preço/unidade comercial.
- Não existe registro de "serviço prestado ao cliente" nem faturamento de serviço.
- NFS-e: nenhuma função de envio existe. Nas 4 empresas, `nfse_enabled = false` e nenhuma tem credencial; 2 apontam provedor NFSE_NACIONAL, 2 nenhum. Logo a emissão ficará sempre como **pendência de integração** até alguém configurar o provedor — nunca autorização simulada.

## O que será construído (por fases, cada uma com sua aprovação)

**Fase 1 — Catálogo > Serviços (cadastro comercial + guia Fiscal)**
- Nova tabela `catalog_services` por empresa: descrição, unidade, preço, ativo; unicidade de nome por empresa.
- Vínculo composto: perfil fiscal do serviço passa a referenciar (serviço, empresa) — perfil só pode apontar para serviço da mesma empresa.
- Tela Catálogo > Serviços (consultoria e qualquer outro), com guia Fiscal abrindo o editor fiscal de serviço já existente. Rotas atuais preservadas.
- Permissão: leitura para perfis internos da empresa; gravação por administrador/gestor/financeiro (a confirmar).

**Fase 2 — Serviço prestado ao cliente**
- Tabela `service_engagements`: serviço, cliente, data, quantidade, valor unitário (cópia imutável do preço), total, status (rascunho / pronto para faturar / faturado / cancelado).
- Coerência garantida no banco: serviço, cliente e registro da mesma empresa (chaves compostas), quantidade > 0, valor ≥ 0.

**Fase 3 — Faturamento idempotente**
- Função no servidor que, com chave de idempotência, cria um único rascunho de NFS-e no fluxo fiscal existente (`fiscal_invoices` modelo NFS-e, `rpc_fiscal_draft_save`) a partir dos serviços prestados. Repetição devolve o mesmo rascunho.
- Recebível NÃO é criado no faturamento: segue a regra vigente, só após autorização fiscal válida, pelo motor único já existente.

**Fase 4 — Emissão NFS-e pelo provedor da empresa**
- Função de envio que lê o provedor e a credencial da própria empresa. Sem provedor/credencial/`nfse_enabled`: devolve "integração não configurada" e a nota fica em rascunho com pendência.
- Estados exibidos: Rascunho, Envio pendente, Rejeitada (com motivo do provedor), Autorizada (somente com protocolo real do provedor).
- Implementação de um provedor real (NFS-e Nacional) só com credencial de homologação fornecida por você; até lá a função fica fechada.

## Testes e limites
- Testes locais/isolados com massa sintética: segregação entre duas empresas em listas, buscas, cache, gravações, funções e faturamento; idempotência concorrente; permissões.
- Grants e políticas conferidos por leitura antes e depois de cada migração.
- Teste no navegador logado fica com você; não vou impersonar.
- Nada publicado, nenhuma nota real emitida.

## Decisões que preciso de você
1. Quem pode cadastrar serviço e lançar serviço prestado (sugestão: administrador, gestor e financeiro; faturar: administrador/financeiro).
2. Confirma que o recebível só nasce com a NFS-e autorizada (como na NF-e)?
3. Tem credencial de homologação da NFS-e Nacional para a Fase 4, ou ela fica fechada como pendência?

## Detalhes técnicos
- Migrações novas: `catalog_services`, `service_engagements`, FK composta `(service_id, organization_id)` em `service_fiscal_profiles` (backfill só se houver linhas; hoje a tabela está vazia), RPC `rpc_service_billing_create_draft_v1(p_engagement_ids uuid[], p_idempotency_key text)` SECURITY DEFINER com `search_path` fixo, `h15_actor_organization()`, `fiscal_org_released`, EXECUTE revogado de PUBLIC/anon.
- Todas as tabelas: GRANT explícito, RLS restritiva por organização igual à da migração do proprietário.
