import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fonte = readFileSync(resolve(process.cwd(), "src/pages/ConsultorTecnico.tsx"), "utf8");

describe("ConsultorTecnico — contrato estático da página", () => {
  it("nunca ignora erro das consultas (throw explícito)", () => {
    expect(fonte).toContain("if (error) throw error;");
    expect(fonte).toContain("if (erroVinc) throw erroVinc;");
    expect(fonte).toContain("if (erroClientesQuery) throw erroClientesQuery;");
    expect(fonte).toContain("if (rolesError) throw rolesError;");
    expect(fonte).toContain("if (profilesError) throw profilesError;");
  });

  it("erro e vazio são estados distintos, com Tentar novamente", () => {
    expect(fonte).toContain("Não foi possível carregar a equipe técnica.");
    expect(fonte).toContain("Não foi possível carregar a atividade deste consultor.");
    expect(fonte).toContain("Não foi possível carregar as visitas.");
    expect(fonte).toContain("Não foi possível carregar os clientes vinculados.");
    expect(fonte).toContain("Não foi possível gerar os links seguros das evidências.");
    expect((fonte.match(/Tentar novamente/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("métricas globais não mostram 0 quando a consulta falha", () => {
    expect(fonte).toContain("metricasVisitas.error");
    expect(fonte).toContain("Indisponível no momento.");
  });

  it("não usa select('*') em profiles e deduplica ids", () => {
    expect(fonte).not.toMatch(/from\("profiles"\)[\s\S]{0,40}select\("\*"\)/);
    expect(fonte).toContain("select(PROFILE_FIELDS)");
    expect(fonte).toContain("idsUnicos(");
  });

  it("troca/fechamento de consultor reinicia todo o estado dependente", () => {
    expect(fonte).toContain("const resetEstadoConsultor");
    expect(fonte).toContain("selecionarConsultor");
    expect(fonte).toContain("fecharConsultor");
    expect(fonte).toContain('setSelectedClienteFilter("todos")');
    // nenhuma linha da UI deve chamar setSelected direto (ignora os helpers)
    const chamadasDiretas = (fonte.match(/onClick=\{\(\) => setSelected\(/g) ?? []).length;
    expect(chamadasDiretas).toBe(0);
  });

  it("grade, ampliação, miniatura e download usam a mesma URL efetiva", () => {
    expect(fonte).toContain("const urlDaEvidencia");
    expect((fonte.match(/urlDaEvidencia\(/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // nenhuma renderização direta de arquivo_url
    expect(fonte).not.toContain("src={file.arquivo_url}");
    expect(fonte).not.toContain("selectedVistoria.arquivos[zoomedImageIndex].arquivo_url");
  });

  it("download verifica response.ok, extensão real e revoga blob", () => {
    expect(fonte).toContain("if (!response.ok)");
    expect(fonte).toContain("nomeDownloadEvidencia(");
    expect(fonte).toContain("revokeObjectURL");
    expect(fonte).toContain("} finally {");
    expect(fonte).not.toContain("window.open(");
  });

  it("ampliar/baixar ficam bloqueados enquanto a URL segura não está pronta", () => {
    expect(fonte).toContain('estado !== "pronta"');
    expect(fonte).toContain("disabled={!pronta}");
  });

  it("update de legenda é escopado e confere linha única", () => {
    expect(fonte).toContain('.from("registros_consultor_arquivos")');
    expect(fonte).toContain('.eq("registro_consultor_id", registroId)');
    expect(fonte).toContain("conferirLinhaUnica(data)");
  });

  it("atalhos globais ignoram controles editáveis", () => {
    expect((fonte.match(/deveIgnorarAtalho\(e\.target\)/g) ?? []).length).toBe(2);
  });

  it("acesso amplo só via helper de papéis administrativos", () => {
    expect(fonte).toContain("temAcessoAmploClientes(selected.role)");
  });

  it("controles só com ícone têm rótulo acessível", () => {
    expect(fonte).toContain('aria-label="Baixar imagem"');
    expect(fonte).toContain('aria-label="Imagem anterior"');
    expect(fonte).toContain('aria-label="Próxima imagem"');
    expect(fonte).toContain('aria-label="Filtrar atividade por cliente"');
  });

  it("não exibe colunas inexistentes no contrato de profiles", () => {
    for (const campo of ["data_admissao", "especialidade", "crea", "formatTelefone"]) {
      expect(fonte).not.toContain(campo);
    }
  });
});
