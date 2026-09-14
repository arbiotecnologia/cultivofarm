import { describe, it, expect } from "vitest";
import {
  CAMPOS_DADOS_ENTREGA,
  montarDadosEntrega,
  validarRespostaCriarEntrega,
} from "@/lib/entregas/payloadEntrega";
import { volumeUnitarioMlDoEstoque, calcularVolumePreviewMl } from "@/lib/entregas/volumeEstoque";
import { labelModalidade, labelResponsavel, normalizarTipoEntrega } from "@/lib/entregas/modalidade";

describe("whitelist de p_dados da entrega", () => {
  const origem = {
    cliente_id: "cli-1",
    tipo_entrega: "retirada",
    grupo_entrega_id: "grp-1",
    data_saida: "2026-09-14",
    motorista: "Lucas",
    motorista_telefone: "(11) 90000-0000",
    motorista_documento: "1234",
    veiculo: "Fiorino",
    veiculo_placa: "ABC1D23",
    veiculo_tipo: "utilitario",
    hora_saida_prevista: "08:00",
    data_chegada_prevista: "2026-09-15",
    hora_chegada_prevista: "10:00",
    destinatario_nome: "Fazenda Boa Vista",
    destinatario_telefone: "(11) 91111-1111",
    destinatario_whatsapp: "(11) 92222-2222",
    endereco_origem: "personalizado",
    endereco_logradouro: "Rua A",
    endereco_numero: "10",
    endereco_complemento: "Sala 2",
    endereco_bairro: "Centro",
    endereco_cidade: "Campinas",
    endereco_uf: "SP",
    endereco_cep: "13000-000",
    endereco_referencia: "Portão azul",
    // campos que NÃO podem ser enviados
    volume_entregue_ml: 99999,
    estoque_produto_id: "est-1",
    quantidade_entregue: 10,
    status: "entregue",
  };

  it("envia exatamente os campos da whitelist", () => {
    const dados = montarDadosEntrega(origem);
    expect(Object.keys(dados).sort()).toEqual([...CAMPOS_DADOS_ENTREGA].sort());
  });

  it("preserva todos os campos do formulário de entrega", () => {
    const dados = montarDadosEntrega(origem);
    expect(dados.tipo_entrega).toBe("retirada");
    expect(dados.grupo_entrega_id).toBe("grp-1");
    expect(dados.motorista_telefone).toBe("(11) 90000-0000");
    expect(dados.veiculo_placa).toBe("ABC1D23");
    expect(dados.hora_chegada_prevista).toBe("10:00");
    expect(dados.destinatario_whatsapp).toBe("(11) 92222-2222");
    expect(dados.endereco_origem).toBe("personalizado");
    expect(dados.endereco_referencia).toBe("Portão azul");
  });

  it("nunca envia volume como autoridade do cliente", () => {
    const dados = montarDadosEntrega(origem) as any;
    expect(dados.volume_entregue_ml).toBeUndefined();
    expect(JSON.stringify(dados)).not.toContain("99999");
  });

  it("normaliza tipo_entrega e endereco_origem inválidos", () => {
    const dados = montarDadosEntrega({ tipo_entrega: "aviao", endereco_origem: "marte" });
    expect(dados.tipo_entrega).toBe("motorista");
    expect(dados.endereco_origem).toBe("cadastro");
  });

  it("converte texto vazio em nulo", () => {
    const dados = montarDadosEntrega({ motorista: "   ", veiculo: "" });
    expect(dados.motorista).toBeNull();
    expect(dados.veiculo).toBeNull();
  });
});

describe("resposta da RPC de criação de entrega", () => {
  it("aceita resposta completa", () => {
    const r = validarRespostaCriarEntrega({ success: true, entrega_id: "e-1", message: "ok" });
    expect(r.entrega_id).toBe("e-1");
    expect(r.replay).toBe(false);
  });

  it("reconhece replay", () => {
    const r = validarRespostaCriarEntrega({ success: true, entrega_id: "e-1", replay: true });
    expect(r.replay).toBe(true);
  });

  it("rejeita resposta sem entrega_id", () => {
    expect(() => validarRespostaCriarEntrega({ success: true })).toThrow(
      /não foi possível confirmar/i,
    );
  });

  it("rejeita resposta sem success", () => {
    expect(() => validarRespostaCriarEntrega({ entrega_id: "e-1" })).toThrow();
    expect(() => validarRespostaCriarEntrega(null)).toThrow();
  });
});

describe("volume previsto a partir do item de estoque", () => {
  it("10 L em 10 unidades => 1000 mL por unidade", () => {
    expect(volumeUnitarioMlDoEstoque({ volume_total: 10, quantidade: 10 })).toBe(1000);
  });

  it("soma o preview multiplicando pela quantidade entregue", () => {
    const r = calcularVolumePreviewMl([
      { item: { volume_total: 10, quantidade: 10 }, quantidade: 3 },
    ]);
    expect(r.volumeMl).toBe(3000);
    expect(r.indeterminado).toBe(false);
  });

  it("usa o item de estoque mesmo com várias embalagens no lote", () => {
    const item = {
      volume_total: 12,
      quantidade: 24, // 500 mL por unidade
      _envase: { volume_por_unidade: 5000 }, // último envase do lote: NÃO deve ser usado
    };
    const r = calcularVolumePreviewMl([{ item, quantidade: 2 }]);
    expect(r.volumeMl).toBe(1000);
  });

  it("não usa zero silencioso quando o volume é indeterminável", () => {
    expect(volumeUnitarioMlDoEstoque({ volume_total: 0, quantidade: 10 })).toBeNull();
    expect(volumeUnitarioMlDoEstoque({ volume_total: 10, quantidade: 0 })).toBeNull();
    expect(volumeUnitarioMlDoEstoque({ volume_total: "abc", quantidade: 10 })).toBeNull();
    expect(volumeUnitarioMlDoEstoque({ volume_total: -5, quantidade: 10 })).toBeNull();
    expect(volumeUnitarioMlDoEstoque({ volume_total: Infinity, quantidade: 10 })).toBeNull();

    const r = calcularVolumePreviewMl([
      { item: { volume_total: 10, quantidade: 10 }, quantidade: 1 },
      { item: { volume_total: null, quantidade: 10 }, quantidade: 1 },
    ]);
    expect(r.volumeMl).toBe(1000);
    expect(r.indeterminado).toBe(true);
  });
});

describe("modalidade da entrega", () => {
  it("rotula retirada e motorista", () => {
    expect(labelModalidade("retirada")).toBe("Retirada");
    expect(labelResponsavel("retirada")).toBe("Retirado por");
    expect(labelModalidade("motorista")).toBe("Entrega por motorista");
    expect(labelResponsavel("motorista")).toBe("Motorista");
  });

  it("trata valor ausente como entrega por motorista", () => {
    expect(normalizarTipoEntrega(undefined)).toBe("motorista");
    expect(labelResponsavel(null)).toBe("Motorista");
  });
});
