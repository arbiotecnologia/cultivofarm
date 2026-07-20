import { supabase } from "@/integrations/supabase/client";

export interface DestinatarioSnapshot {
  destinatario_nome: string;
  destinatario_telefone: string;
  destinatario_whatsapp: string;
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf: string;
  endereco_cep: string;
  endereco_referencia: string;
}

export const emptyDestinatario = (): DestinatarioSnapshot => ({
  destinatario_nome: "",
  destinatario_telefone: "",
  destinatario_whatsapp: "",
  endereco_logradouro: "",
  endereco_numero: "",
  endereco_complemento: "",
  endereco_bairro: "",
  endereco_cidade: "",
  endereco_uf: "",
  endereco_cep: "",
  endereco_referencia: "",
});

/**
 * Resolve o destinatário e endereço padrão a partir da OS.
 * - OS padrão/on-farm: usa fazenda + cliente.
 * - OS B2B: usa partner_accounts (endereço de entrega quando definido).
 */
export async function resolveDestinatarioFromOS(
  osId: string,
  osTipo: string,
): Promise<DestinatarioSnapshot> {
  const snap = emptyDestinatario();

  if (osTipo === "onfarm") {
    const { data } = await supabase
      .from("ordens_servico_onfarm")
      .select(
        "clientes(nome, telefone, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_municipio, endereco_estado, endereco_cep), fazendas(nome, municipio, endereco_acesso, responsavel_local_telefone)"
      )
      .eq("id", osId)
      .maybeSingle();
    const c: any = data?.clientes;
    const f: any = data?.fazendas;
    if (c) {
      snap.destinatario_nome = c.nome || "";
      snap.destinatario_telefone = c.telefone || "";
      snap.endereco_logradouro = c.endereco_logradouro || "";
      snap.endereco_numero = c.endereco_numero || "";
      snap.endereco_complemento = c.endereco_complemento || "";
      snap.endereco_bairro = c.endereco_bairro || "";
      snap.endereco_cidade = c.endereco_municipio || "";
      snap.endereco_uf = c.endereco_estado || "";
      snap.endereco_cep = c.endereco_cep || "";
    }
    if (f) {
      snap.endereco_referencia = [f.nome, f.endereco_acesso].filter(Boolean).join(" · ");
      if (!snap.destinatario_telefone && f.responsavel_local_telefone) {
        snap.destinatario_telefone = f.responsavel_local_telefone;
      }
      if (!snap.endereco_cidade && f.municipio) snap.endereco_cidade = f.municipio;
    }
    return snap;
  }

  // padrao ou b2b — ambos vivem em ordens_servico
  const { data } = await supabase
    .from("ordens_servico")
    .select(
      "clientes(nome, telefone, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_municipio, endereco_estado, endereco_cep), fazendas(nome, municipio, endereco_acesso, responsavel_local_telefone), partner_order_id, partner_orders(partner_accounts(nome_fantasia, razao_social, telefone_comercial, whatsapp_comercial, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, cep, endereco_entrega_igual_comercial, entrega_cep, entrega_cidade, entrega_estado))"
    )
    .eq("id", osId)
    .maybeSingle();

  const partner: any = data?.partner_orders?.partner_accounts;
  const c: any = data?.clientes;
  const f: any = data?.fazendas;

  if (partner) {
    snap.destinatario_nome = partner.nome_fantasia || partner.razao_social || "";
    snap.destinatario_telefone = partner.telefone_comercial || "";
    snap.destinatario_whatsapp = partner.whatsapp_comercial || "";
    snap.endereco_logradouro = partner.endereco_logradouro || "";
    snap.endereco_numero = partner.endereco_numero || "";
    snap.endereco_complemento = partner.endereco_complemento || "";
    snap.endereco_bairro = partner.endereco_bairro || "";
    snap.endereco_cep = partner.cep || "";
    if (partner.endereco_entrega_igual_comercial === false) {
      snap.endereco_cep = partner.entrega_cep || snap.endereco_cep;
      snap.endereco_cidade = partner.entrega_cidade || "";
      snap.endereco_uf = partner.entrega_estado || "";
    }
    return snap;
  }

  if (c) {
    snap.destinatario_nome = c.nome || "";
    snap.destinatario_telefone = c.telefone || "";
    snap.endereco_logradouro = c.endereco_logradouro || "";
    snap.endereco_numero = c.endereco_numero || "";
    snap.endereco_complemento = c.endereco_complemento || "";
    snap.endereco_bairro = c.endereco_bairro || "";
    snap.endereco_cidade = c.endereco_municipio || "";
    snap.endereco_uf = c.endereco_estado || "";
    snap.endereco_cep = c.endereco_cep || "";
  }
  if (f) {
    snap.endereco_referencia = [f.nome, f.endereco_acesso].filter(Boolean).join(" · ");
    if (!snap.destinatario_telefone && f.responsavel_local_telefone) {
      snap.destinatario_telefone = f.responsavel_local_telefone;
    }
    if (!snap.endereco_cidade && f.municipio) snap.endereco_cidade = f.municipio;
  }
  return snap;
}
