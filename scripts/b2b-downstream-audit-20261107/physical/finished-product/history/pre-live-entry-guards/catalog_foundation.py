#!/usr/bin/env python3
"""Costura declarativa do catálogo atual no PostgreSQL descartável.

Não é instalação do catálogo nem fonte LIVE. Apenas reconcilia a captura física
antiga com as colunas/relações canônicas já usadas pelo B3, sem writers, preços,
flags Owned, grants de cliente ou cadastro paralelo.
"""


def apply(sql, organization_id):
    sql(f"""
    ALTER TABLE public.produtos ADD COLUMN owner_organization_id uuid REFERENCES public.organizations(id);
    UPDATE public.produtos SET owner_organization_id='{organization_id}' WHERE owner_organization_id IS NULL;
    ALTER TABLE public.produtos ALTER COLUMN owner_organization_id SET NOT NULL;
    ALTER TABLE public.catalogo_volumes ADD COLUMN owner_organization_id uuid REFERENCES public.organizations(id);
    UPDATE public.catalogo_volumes SET owner_organization_id='{organization_id}' WHERE owner_organization_id IS NULL;
    ALTER TABLE public.catalogo_volumes ALTER COLUMN owner_organization_id SET NOT NULL;
    ALTER TABLE public.catalogo_volumes ADD COLUMN medida text NOT NULL DEFAULT 'volume';
    ALTER TABLE public.catalogo_volumes ALTER COLUMN volume_ml DROP NOT NULL;
    CREATE TABLE public.product_sale_units(
      product_id uuid PRIMARY KEY REFERENCES public.produtos(id),
      owner_organization_id uuid NOT NULL REFERENCES public.organizations(id),
      unidade_conteudo text NOT NULL CHECK (unidade_conteudo IN ('kg','g','ml','l')),
      forma_fisica text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid,
      version integer NOT NULL DEFAULT 1 CHECK(version>=1)
    );
    CREATE TABLE public.product_packagings(
      id uuid PRIMARY KEY REFERENCES public.catalogo_volumes(id) ON DELETE RESTRICT,
      product_id uuid NOT NULL REFERENCES public.produtos(id),
      owner_organization_id uuid NOT NULL REFERENCES public.organizations(id),
      codigo text NOT NULL CHECK(btrim(codigo)<>''),
      descricao text,
      peso_liquido_kg numeric NOT NULL CHECK(peso_liquido_kg>0),
      version integer NOT NULL DEFAULT 1 CHECK(version>=1),
      ativo boolean NOT NULL DEFAULT true,
      valid_from timestamptz NOT NULL DEFAULT now(),
      valid_to timestamptz,
      created_by uuid,
      CONSTRAINT pp_codigo_version UNIQUE(product_id,codigo,version),
      CONSTRAINT pp_window CHECK(valid_to IS NULL OR valid_to>=valid_from)
    );
    REVOKE ALL ON public.product_sale_units,public.product_packagings FROM PUBLIC,anon,authenticated,service_role;
    ALTER TABLE public.product_sale_units ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.product_packagings ENABLE ROW LEVEL SECURITY;
    """)
