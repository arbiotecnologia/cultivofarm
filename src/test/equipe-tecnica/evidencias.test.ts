import { describe, it, expect } from "vitest";
import {
  PROFILE_FIELDS,
  PAPEIS_ACESSO_AMPLO,
  temAcessoAmploClientes,
  normalizarTexto,
  idsUnicos,
  resolverUrlEvidencia,
  extensaoEvidencia,
  nomeDownloadEvidencia,
  normalizarLegenda,
  LEGENDA_MAX,
  conferirLinhaUnica,
  deveIgnorarAtalho,
  ESTADO_DIALOGO_INICIAL,
} from "@/lib/equipe-tecnica/evidencias";
import { filtrarConsultores } from "@/lib/equipe-tecnica/consultores";

describe("equipe técnica — perfis e acesso", () => {
  it("traz apenas os campos realmente necessários de profiles", () => {
    expect(PROFILE_FIELDS).toBe("id, user_id, nome, email, ativo");
    expect(PROFILE_FIELDS).not.toContain("*");
    expect(PROFILE_FIELDS).not.toContain("avatar_url");
    expect(PROFILE_FIELDS).not.toContain("created_at");
  });

  it("papéis técnicos NÃO recebem texto de acesso amplo", () => {
    expect(temAcessoAmploClientes("consultor_tecnico")).toBe(false);
    expect(temAcessoAmploClientes("tecnico_agronomo")).toBe(false);
    expect(PAPEIS_ACESSO_AMPLO).not.toContain("consultor_tecnico" as never);
  });

  it("papéis administrativos amplos são reconhecidos", () => {
    expect(temAcessoAmploClientes("administrador")).toBe(true);
    expect(temAcessoAmploClientes("gestor")).toBe(true);
    expect(temAcessoAmploClientes(null)).toBe(false);
  });

  it("deduplica ids antes do .in()", () => {
    expect(idsUnicos(["a", "a", null, "b", undefined, ""])).toEqual(["a", "b"]);
  });
});

describe("equipe técnica — busca sem acento", () => {
  it("normaliza acentuação, caixa e espaços", () => {
    expect(normalizarTexto("  José ÁVILA ")).toBe("jose avila");
  });

  it("filtra consultor acentuado com termo sem acento", () => {
    const lista = [{ nome: "José Ávila", email: null }, { nome: "Bruno", email: null }];
    expect(filtrarConsultores(lista as any, "jose avila")).toHaveLength(1);
    expect(filtrarConsultores(lista as any, "ÁVILA")).toHaveLength(1);
  });
});

describe("equipe técnica — URL efetiva da evidência", () => {
  const comPath = { id: "1", arquivo_path: "p/1.png", arquivo_url: "https://legado/1.jpg" };

  it("usa a signed URL quando há path", () => {
    const r = resolverUrlEvidencia(comPath, { "p/1.png": "https://assinada" });
    expect(r).toEqual({ url: "https://assinada", estado: "pronta" });
  });

  it("NUNCA cai para arquivo_url quando o path existe e a assinatura falha", () => {
    const r = resolverUrlEvidencia(comPath, {}, { error: new Error("x") });
    expect(r.url).toBeNull();
    expect(r.estado).toBe("erro");
  });

  it("expõe carregamento enquanto a assinatura não chega", () => {
    expect(resolverUrlEvidencia(comPath, {}, { loading: true }).estado).toBe("carregando");
  });

  it("aceita arquivo_url apenas em registro legado sem path", () => {
    const r = resolverUrlEvidencia({ id: "2", arquivo_url: "https://legado/2.png" }, {});
    expect(r).toEqual({ url: "https://legado/2.png", estado: "pronta" });
  });

  it("registro sem path e sem url é indisponível", () => {
    expect(resolverUrlEvidencia({ id: "3" }, {}).estado).toBe("indisponivel");
  });
});

describe("equipe técnica — download", () => {
  it("preserva a extensão real e não força .jpg", () => {
    expect(extensaoEvidencia({ id: "1", arquivo_path: "c/a/foto.png" })).toBe("png");
    expect(extensaoEvidencia({ id: "1", nome_arquivo: "laudo.pdf" })).toBe("pdf");
    expect(extensaoEvidencia({ id: "1", arquivo_path: "c/a/foto.webp?token=x" })).toBe("webp");
    expect(nomeDownloadEvidencia({ id: "1", arquivo_path: "c/a/foto.png" }, "v1", 0)).toBe("visita_v1_1.png");
  });

  it("sem extensão conhecida não inventa sufixo", () => {
    expect(extensaoEvidencia({ id: "1", arquivo_path: "c/a/foto" })).toBeNull();
    expect(nomeDownloadEvidencia({ id: "1", arquivo_path: "c/a/foto" }, "v1", 1)).toBe("visita_v1_2");
  });
});

describe("equipe técnica — legenda", () => {
  it("normaliza espaços e respeita o limite", () => {
    expect(normalizarLegenda("  a   b ")).toEqual({ valida: true, valor: "a b" });
    expect(normalizarLegenda("x".repeat(LEGENDA_MAX + 1)).valida).toBe(false);
  });

  it("zero linha atualizada nunca é sucesso", () => {
    expect(conferirLinhaUnica([]).ok).toBe(false);
    expect(conferirLinhaUnica(null).ok).toBe(false);
    expect(conferirLinhaUnica([{ id: "1" }]).ok).toBe(true);
    expect(conferirLinhaUnica([{ id: "1" }, { id: "2" }]).ok).toBe(false);
  });
});

describe("equipe técnica — atalhos de teclado", () => {
  const alvo = (tag: string, extra: Record<string, unknown> = {}) => ({
    tagName: tag,
    getAttribute: () => null,
    ...extra,
  }) as unknown as EventTarget;

  it("ignora atalhos com foco em controles editáveis", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "BUTTON"]) {
      expect(deveIgnorarAtalho(alvo(tag))).toBe(true);
    }
    expect(deveIgnorarAtalho(alvo("DIV", { isContentEditable: true }))).toBe(true);
    expect(
      deveIgnorarAtalho({ tagName: "DIV", getAttribute: () => "textbox" } as unknown as EventTarget),
    ).toBe(true);
  });

  it("permite atalhos fora de controles editáveis", () => {
    expect(deveIgnorarAtalho(alvo("DIV"))).toBe(false);
    expect(deveIgnorarAtalho(null)).toBe(false);
  });
});

describe("equipe técnica — reset ao trocar consultor", () => {
  it("estado inicial do diálogo limpa filtro, fotos, zoom e edição", () => {
    expect(ESTADO_DIALOGO_INICIAL).toEqual({
      showVistorias: false,
      selectedVistoria: null,
      selectedClienteFilter: "todos",
      zoomedImageIndex: null,
      selectedPhotos: [],
      focusedPhotoIndex: null,
      editingCaption: null,
      captionValue: "",
    });
  });
});
