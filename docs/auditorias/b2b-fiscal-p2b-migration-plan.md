# P2B — Plano histórico; implementação parcial aditiva aplicada

Atualização: [continuidade P2B/P2C–P6](b2b-fiscal-p2c-p6-2026-10-08.md) registra
as migrations oficiais `20261008192025`, `20261008192236` e `20261008192601`.
Snapshots JSONB/triggers e contenções foram aplicados; criador interno, revisão
append-only, propagação e provas autenticadas não foram liberados/comprovados.
A sequência abaixo é a proposta histórica, não SQL para aplicar nem GO operacional.

## Escopo e pré-condições

Alterar apenas fluxos existentes de pedidos NOVOS operados por A. Nenhum mandato, federação, tabela de vínculo A/P, alteração de organizations.partner_account_id, backfill ou reescrita de legado. Este documento não é SQL executável e não deve ser usado como migration automática.

Antes de implementação, capturar schema/RLS/ACL/triggers/corpos completos e hashes no canônico; comprovar que o criador interno pode derivar owner A pelo perfil ativo e parceiro comercial. Resolver explicitamente a fonte credora/emissora da operação: owner comercial sozinho não substitui contrato fiscal. Seleção de company_fiscal_settings deve validar organização, situação e elegibilidade; zero ou múltiplos candidatos sem critério canônico = negar. Não usar LIMIT1/CNPJ/tenant P.

## Sequência proposta

1. Migration oficial aditiva/versionada com preflight do ref e hashes dos corpos, mantendo BF01–03/P1A/P2A. Campos propostos no pedido: organization_id comercial, creditor_organization_id_snapshot, issuer_organization_id_snapshot, company_settings_id_snapshot, versão/estado do snapshot e payload econômico canônico selado. Nomes e tipos finais dependem revisão do catálogo e contrato; não aplicar enquanto seleção não estiver demonstrada.
2. Colunas legadas podem permanecer NULL para preservar histórico; NULL não autoriza continuação. Trigger de validação em INSERT exige todos os snapshots para novo fluxo interno; nenhum default que atribua owner a pedidos antigos. Identidade do pedido e snapshots organizacionais imutáveis em UPDATE; não expor setters diretos. FKs não substituem validação de igualdade/escopo. Se criar tabela pública de revisões, GRANT mínimo imediatamente após CREATE, depois RLS e policies por owner A; sem anon.
3. Criador existente deriva ator/org/papel/feature/estado e valida parceiro/cliente A antes de locks, lookup ou replay; sem alterar guard compartilhado P. Receipt com ator/org/operação/conteúdo e resultado só após target autorizado; chave/fingerprint deve incluir unidade/volume e demais argumentos materialmente usados. Mesmo receipt jamais cruza A/P; identidade removida/revogada deve negar até replay.
4. Preços/descontos/juros/prazos vêm exclusivamente do resolver canônico. Pedido `aguardando_cotacao` mantém estado econômico não definitivo, sem fabricar zero como preço aprovado. Cotação legítima resolve Q-01 junto com owner/role/feature/status, cria revisão append-only em vez de DELETE histórico e sela preço/condição quando definidos. Aprovação/crédito são metadados autorizados, não reprecificação do snapshot selado. Não inventar status novo antes de mapear enum e telas existentes.
5. Triggers cobrem INSERT/UPDATE/DELETE dos itens, ambos os pais em mudança de order_id, cabeçalho, condições e cronograma; lock consistente por pedido. Evitar GUC como autorização; autorização/ticket privado transacional se necessário. Cancelado/reprovado não pode reabrir mutabilidade por sair do conjunto approved_or_later. Regras reais de revisão/cancelamento precisam revisão, não inferência.
6. Produção/entrega/link/recebível/fiscal devem validar igualdade com owner/creditor/issuer do snapshot antes do replay ou efeitos, nunca derivar por organizations.partner_account_id ou organização corrente isoladamente. Não liberar endpoint financeiro como parte de snapshot incompleto. Novos caminhos privados devem revogar PUBLIC/anon, fixar search_path e conceder somente endpoint comprovado.

## Harness obrigatório antes de GO

Paridade homolog primeiro: arrays completos de migrations/schema/constraints/RLS/ACL/RPC/triggers/índices e configuração fiscal sem segredos, não apenas MD5. Sem acesso/paridade, usar executor seguro no canônico com BEGIN/ROLLBACK, IDs aleatórios TEMPORARY_AUDIT e manifesto. Não inventar Auth; usar sessões autorizadas existentes. Capturar hashes/contagens antes/depois, incluir schedules/receipts/audit/timeline/outbox e impedir efeitos externos durante harness.

Provar separadamente: A próprio positivo; P→A e A→P; CNPJ igual/link P sem direito; ator inativo/sem org/sem papel/feature/assinatura inadequada; cliente/partner cruzado ou órfão; emissor inexistente/ambíguo; status inválido; alteração de cada campo selado (preço/desconto/condição/credor/emissor); troca dos pais; cotação sem preço definido; preço mudou; mesma chave mesmo payload; mesma chave conteúdo/unidade/volume diferente; replay por outro ator/org; duas sessões reais e rollback após falha intermediária. Uma asserção concreta por regra, jamais snapshots de markup como prova de segurança.

SQL claims simulados = camada PostgreSQL/RLS, não JWT/API/browser. Exigir execução RPC autenticada real com stored owner inspecionado e tentativa de owner alternativo rejeitada; caso não executado: **Authenticated path: UNVERIFIED**. Não transportar nota, cobrar, enviar notificação externa ou acessar PFX.

## Reversão/gates

Rollback operacional por sucessora que bloqueia o endpoint novo antes de efeitos e mantém colunas/snapshots/histórico; não apagar dados nem reabrir helpers P ou ACL financeiras. A implementação parcial posterior está descrita no relatório vigente; não reaplicar migrations. Gate operacional depende provas positivas/negativas por camada e concorrência real. A autorização contínua permite auditar read-only as fases posteriores, nunca habilitar elos sem prova.