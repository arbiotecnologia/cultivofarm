# Aplicações — existência e tenant antes da autorização

## Pós-implantação informado pelo auditor — 19/10 12:38 UTC
- Destino confirmado pelo auditor: `swzpzcwiasxmjutrmvkm`. Migration `application_access_tenant_integrity_20261019` aplicada pelo auditor via apply_migration, `success=true`, usando `candidate.sql.review` de `ee29d35e`, SHA256 `01f4bcaffaa57e28d9829f55a40b9a6d1251499a53bf0fe4b77c5172e8514d9d`.
- Preflight READ ONLY executou guarda integral de10 funções/ACL/schema; aplicações0/evidências0. Postflight integral PASS, MD5 POST `04067ba43cea3eed845a1fd3735061e0`. Não reaplicar candidata; rollback continua guardado e nunca automático.
- SQL com claims financeiroA/adminB: h15 correto, UUID inexistente e NULL retornaram false em ambos; linhas visíveis0. **SQL claims, NÃO JWT real**; não prova positivo de aplicação/anexo.
- Browser real A/B informado: Ver Histórico alterou queryKey, mostrou Carregando e depois Nenhuma aplicação registrada em ambos, sem erros/reload/logout/troca de sessão. **Somente smoke de leitura vazia**, não homologação positiva de PDF/anexo/revogação.
- Advisors antes/depois com mesmos counts: INFO36; WARN2anon+336auth+1password. Findings permanecem; não declarar projeto sem findings nem auditoria global concluída.
- RPC salvar permanece fechada, aplicações/evidências0; PDF frontend **NÃO publicado**, typecheck app **NÃO certificado**. Pacotes SQL/PDF preservados byte-exatos. Nenhuma nova execução hosted/runtime/DDL/deploy/publicação nesta entrega; resultados acima são informados pelo auditor.
- Auditor leu `legacy_closed`: não reabrir nem conceder EXECUTE. Replay antes da reautorização, referências e metadados exigem revisão própria antes de futura recuperação do fluxo canônico; não contornar com INSERT/novo fluxo.
- V6: auditor coletou hoje corpos/MD5/ACL das44 assinaturas de v6-writers-catalog, todas presentes, com evidência local informada `v6-writer-bodies-20261019.json`. Não pedir esses corpos como ausentes. Locks/tempo/ABA ainda não certificados; v6 não ativado, contratos não avançados.

As seções seguintes preservam o histórico de preparação pré-implantação; seu estado pendente de aplicação foi superado somente pelo resultado informado acima.

## Evidência e alteração mínima
Auditor informou preflight READ ONLY financeiro A/iat atual: helper permitia UUID inexistente. SELECT-only nesta execução confirmou MD5 PRE `b05590fbbc62efb107ed8b551cd08b3f`, postgres, STABLE SECURITY DEFINER, search_path public, ACL postgres/service_role/authenticated sem PUBLIC/anon. Conexão externa/config/cliente canônicos `swzpzcwiasxmjutrmvkm`; nenhuma operação hosted de escrita, fixture ou dado comercial lido. Claims SQL não são login real.

`scripts/application-access-integrity/function.sql.review` coloca os mesmos OR operacional/financeiro/membership dentro do EXISTS, exige aplicação.organization_id igual h15 atual e nega NULL. Cada OS presente deve existir/coincidir: manual/B2B OS.organization_id e cliente.organization_id iguais à aplicação; onfarm **não possui organization_id em produção**, usa cliente persistido como origem do tenant. Ambos pais presentes exigem ambos coerentes; não inventa XOR/igualdade de clientes. Pais/clientes inexistentes/tenant NULL negados, sem backfill. Aplicação sem OS continua possível para operacional/financeiro, existente no tenant h15; membership sem pai nega. Não alterou semântica legítima com nova exigência de OS.

Operacional inclui consultores: não mudou para carteira técnica obrigatória. Revogação de perfil/empresa/readiness/iat/papéis preserva cores h15/has_role atuais, vínculo produtor preserva getter canônico. Perda de papel com membership ainda legítima pode passar pelo ramo original; teste negativo usa vínculo revogado, não falseia o contrato.

## SQL guardado
Candidata/rollback completos BEGIN/COMMIT, lock3s/statement15s/idle30s, operador postgres; hashes fixos de10 funções, owners, ACL exata por aclexplode sem grant option, search_path/definer/volatilidade e colunas UUID usadas. Ausência de organization_id onfarm é pré-requisito explícito: se schema mudar, recusa revisão antiga. CREATE OR REPLACE somente helper, não DROP/GRANT/RLS. POST fixo `04067ba43cea3eed845a1fd3735061e0`; rollback parte desse POST e restaura corpo PRE exato, com pós-checagem e recusa drift. **Rollback restaura vulnerabilidade**, requer autorização específica e não autoinstala.

`preflight-readonly.sql`: SELECT-only corpos/ACL/owners/config/RLS/policies/colunas/FKs/triggers sem linhas de negócio, comparar integralmente antes da aplicação. Policies/tabelas não foram inventadas como fingerprint integral certificado: inventário necessita revisão externa; guard protege funções e campos usados, não segurança global. SQL database name/GUC não prova ref: auditor deve comprovar destino externamente, falhar fechado para outro ref/Cloud. `postflight.sql.review` READ ONLY valida POST/dependências. RPC salvar hash `46d342a71f4712056782cf3d976154a5` e erro STORAGE2_APPLICATION_CONTRACT_UNAVAILABLE intocados.

## Provas locais e limites
Resultado final: **PostgreSQL local71/71**, regressão PDF44/44 e staging preservado7/7. Callers/policies reais inventariados em callers.md; nenhum alterado. Build automático OK (não typecheck), nenhuma suíte ampla ou prova browser/login realizada.
`test-local.py`: PG17 descartável /tmp/socket explícito, sem PGHOST/env remoto; candidata/rollback arquivos completos, helpers capturados h15/readiness/roles/membership MD5 idênticos. Auth.uid/jwt emulam claims; schema reduzido/policy local do helper, não JWT assinado/login/RLS integral de produção.
Reprodução baseline UUID ausente; positivos manual/onfarm/sem OS/dois pais/nove roles/produtor. Negativos app/OS/cliente ausente ou estrangeiro/orgNULL, dois pais com um estrangeiro, vínculo revogado/expirado/futuro, perfil inativo/provisório/sem tenant, empresa inativa/papel removido sem vínculo, processing/iat antigo, sem uid/anon. Leitura via policy, tenant A→B/revoke→restore na própria transação e writer fechado. Drift ACL/dependência, reapply/rollback fora de ordem e falha POST em cópia temporária de ambos arquivos demonstram atomicidade. Não prova concorrência/ABA global/HTTP Storage. Recibo final em results.local.json.

## PDF/tipagem e bloqueios
Complemento informado pelo auditor em 19/10 12:35 UTC: **30 hashes, staging7/7 e 13 casos independentes PDF PASS**, incluindo resposta3s e abort tardio. Evidência independente informada, não executada novamente nesta entrega; não equivale a login/HTTP real ou homologação global.

Dependências LIVE confirmadas pelo auditor (coincidem com contracts.json e guardas existentes; nenhuma atualização de SQL necessária):
- `platform_private.h15_actor_organization()` — `64e10608403238a41a9baf92857ca881`.
- `public.h15_actor_organization()` — `55edafec08bcc84a00f1526c14334a2c`.
- `platform_private.platform_actor_access_ready(uuid)` — `048249c0c2106c3761e26eacb8d0de84`.
- `public.is_operational_staff(uuid)` — `f4b093c506cb05d39aa466bae94a6df8`.
- `public.get_cliente_ids_for_user(uuid)` — `c80d5900692d960f649d0a9f7850fe2c`.
- Writer fechado `public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])` — `46d342a71f4712056782cf3d976154a5`.

**Pendência manage, fora da alteração:** auditor informa que o helper de manage exige existência mas não tenant; Storage1 atual já exige tenant/pai. Essa proteção do caminho Storage1 não certifica todos os callers de manage. Não alterado, não ampliar candidata indiscriminadamente; exige revisão específica de callers/autoridade antes de eventual correção. Auditor aplicará a candidata de leitura após revisão; produção permanece sem DDL/publicação nesta entrega.

PDF d155925 e pacote application-pdf-release byte-exatos, sem runtime/Edge/monitor/gates. Retificação: build Vite/SWC não é typecheck; sem recibo de checker. `typecheck-independent.md` e independent-inputs.json fornecem configuração/entradas/hash/comandos para auditoria externa; typecheck **não certificado**.
Recibo explícito em results.local.json: `tsconfig.app.json` requerido mas **não executado**, checked_project/command/compiler_version/exit_code nulos. Nenhum projeto app certificado; sucesso de `tsc --noEmit` raiz com files vazio/references não é prova de app.
Auditor informa produção sem aplicações/evidências; homologação PDF bloqueada por fixture ausente e writer fechado. Não INSERT/novo fluxo/perfil; v6 global NO-GO por schemas/revisões ausentes. Sessões A/B não acessadas/recarregadas, pagamentos/contratos/publicação intocados.