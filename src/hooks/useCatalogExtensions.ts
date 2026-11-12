import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useTenantCatalogEditor } from "./useTenantCatalogEditor";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const extensionRow = z.object({ id: z.string(), updated_at: z.string(), nome: z.string().optional(), categoria: z.string().optional(), nome_cientifico: z.string().nullable().optional(), culture_id: z.string().nullable().optional(), problem_id: z.string().nullable().optional(), observacao: z.string().nullable().optional(), ativo: z.boolean().optional() }).passthrough();
export type CatalogExtensionRow = z.infer<typeof extensionRow>;
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
export function useCatalogExtensions(kind: "problems" | "links", entity = "produto", parent?: string) {
  const editor = useTenantCatalogEditor();
  const qc = useQueryClient();
  const lock = useRef(false);
  const attempt = useRef<{ sig: string; key: string }>();
  const query = useScopedPortalQuery<CatalogExtensionRow[]>({ queryKey: ["catalog-extensions", kind, entity, parent], enabled: kind === "problems" || !!parent,
    queryFn: async () => { const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("tenant_catalog_extensions_read_v1", { p_kind: kind, p_entity: entity, p_parent: parent ?? null }); if (error) throw new Error("Cadastros e vínculos adicionais indisponíveis neste ambiente."); return z.array(extensionRow).parse(data); } });
  const save = async (id: string | null, version: string | null, payload: Record<string, unknown>) => {
    const current = editor.capture(); if (!editor.canEdit || !current() || lock.current) throw new Error("Contexto indisponível para edição.");
    lock.current = true;
    try {
      const sig = JSON.stringify([editor.scope, kind, entity, parent, id, version, payload]);
      if (attempt.current && attempt.current.sig !== sig) throw new Error("Reconcilie a tentativa anterior antes de alterar o rascunho.");
      attempt.current ??= { sig, key: crypto.randomUUID() };
      const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)("tenant_catalog_extensions_save_v1", { p_kind: kind, p_entity: entity, p_parent: parent ?? null, p_id: id, p_expected: version, p_payload: payload, p_key: attempt.current.key });
      if (!current()) throw new Error("Contexto alterado; rascunho não adotado.");
      if (error) { if (["42501", "22023", "PT409", "23505"].includes(error.code ?? "")) attempt.current = undefined; throw new Error(error.message); }
      const ack = z.object({ ok: z.literal(true), id: z.string().uuid(), updated_at: z.string().datetime({ offset: true }) }).passthrough().parse(data);
      if (id && ack.id !== id) throw new Error("Resposta de outro registro.");
      attempt.current = undefined;
      await qc.invalidateQueries({ queryKey: ["catalog-extensions"] });
      if (!current()) throw new Error("Contexto alterado; resposta não adotada.");
      return ack;
    } finally { lock.current = false; }
  };
  return { ...query, save, canEdit: editor.canEdit, scope: editor.scope };
}