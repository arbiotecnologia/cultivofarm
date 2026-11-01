# Perfis fiscais para todo o catálogo (global e próprio de cada empresa)

## Objetivo
- Tela "Perfis fiscais de produtos globais" deve listar TODOS os itens do catálogo global: microrganismos, produtos biológicos, produtos químicos e fertilizantes/adubos, cada um com configuração fiscal para NF-e (NCM, CEST, CFOP int./inter., origem, CST/CSOSN, IBS/CBS etc.).
- Cada empresa terá a mesma configuração fiscal para os itens do seu catálogo próprio, editável apenas por quem tem autoridade na própria empresa.
- Emissão de NF-e continua desligada (trava técnica ativa); nada é emitido.

## Fases
1. Auditoria read-only (ref `swzpzcwiasxmjutrmvkm` comprovado): quais famílias aparecem hoje, onde ficam químicos/fertilizantes, como microrganismos se ligam a `microorganism_fiscal_profiles`, e como o catálogo próprio é identificado (tenant dono).
2. Tela global: filtro por família (Microrganismo, Biológico, Químico, Fertilizante/Adubo), listagem completa paginada, editor fiscal reutilizado; microrganismos usam o perfil fiscal existente, sem editor paralelo.
3. Catálogo próprio: nova seção "Perfis fiscais do catálogo da empresa" dentro do módulo Fiscal da empresa, reaproveitando o mesmo editor/validação.
4. Banco (pacote candidato inativo, só aplicado com sua autorização): perfil fiscal por item com tenant derivado do dono do item; escrita via RPC com ator real, empresa ativa, papel autorizado, CAS e histórico imutável; superadmin só global, empresa só o próprio; leitura isolada por empresa.
5. Testes: validação de campos, isolamento entre empresas (ARBio x FSF), negação de escrita global por empresa e de escrita em item de outra empresa, regressão fiscal.

## Fora de escopo
Emissão/transmissão SEFAZ, cobranças, automações, alteração de perfis/roles, publicação.

## Detalhes técnicos
- Reutilizar `FiscalProdutos`, `useProductFiscalProfiles`, `productFiscalValidation`, `product_fiscal_profiles`; seguir `scripts/fiscal-products-refinement-20261022/AGENTS.md` (não reaplicar migration global).
- Família vem de rótulos canônicos `catalog_family_labels`, nunca inferida por nome.
- Pacote SQL em `scripts/fiscal-tenant-catalog-<data>/` com AGENTS.md, install/rollback deny-only, testes PG descartáveis (não certificam JWT/RLS real).
- Pendência: classificação fiscal real (NCM/CFOP) de cada item deve vir da contabilidade; nada será inventado.
