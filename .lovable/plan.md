# D51.5 — Fechamento sistêmico e configuração global legada

## Escopo
Concluir somente o P1 sistêmico: policies/RPCs ativas baseadas apenas em papel, funções privilegiadas expostas sem tenant e o singleton `configuracoes_sistema`. Gates anteriores permanecem fechados.

## Execução
1. Consultar o estado vivo de policies, funções, grants e consumidores alcançáveis, separando dados tenant de objetos globais de plataforma.
2. Para superfícies tenant, combinar papel com organização derivada do usuário ativo; quando não houver ownership determinístico, bloquear com segurança sem atribuir dados.
3. Revogar funções privilegiadas críticas de `anon`/`authenticated` quando não provarem ator e recurso; manter apenas acessos globais comprovados e com papel de plataforma.
4. Tratar `configuracoes_sistema` como identidade visual global atual: leitura por usuário ativo, mutação apenas por Superadmin de Plataforma; remover a edição tenant e ocultar seu controle da tela tenant. Não migrar ou copiar branding sem ownership.
5. Validar estado vivo, matriz estrutural/A-B disponível, testes focados e globais, typecheck, build, linter, scanner e smoke passivo.
6. Consolidar auditoria, roadmap, dívidas, rollback/forward-fix e decisão global de segurança versus funcionalidade.

## Premissas e limites
- Banco exclusivo: `swzpzcwiasxmjutrmvkm`.
- Dados e históricos serão preservados; nenhum ownership será inferido.
- Sem ações reais de produção, emissão, envio ou publicação de nova fase.
- Onde faltarem identidades/fixtures autorizadas, a prova funcional A/B será marcada `NO-GO`, sem inventar dados.

## Detalhes técnicos
- Alterações de schema/RLS/grants somente por migration versionada via ferramenta do Supabase.
- `SECURITY DEFINER` deve ter `search_path` seguro, validar `auth.uid()` e tenant/recurso, e usar grants mínimos.
- Policies de atualização terão `USING` e `WITH CHECK`; legado sem vínculo ficará fail-closed.
- O singleton não ganhará `organization_id` nesta etapa; branding por empresa exige modelagem futura explícita.
