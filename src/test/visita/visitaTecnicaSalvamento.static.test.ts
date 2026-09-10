/**
 * H9-G bloco 2B — regressões estáticas sobre src/pages/VisitaTecnica.tsx.
 *
 * Não há como montar a página inteira sem backend; estas provas leem o código-fonte
 * e travam as invariantes reproduzidas na UI autenticada:
 *  - notas rápidas entram em `observacoes_tecnicas` do payload (nada some ao finalizar);
 *  - os dois botões de salvar chamam a mesma ação canônica;
 *  - a finalização persiste antes da RPC e aborta se o salvamento falhar;
 *  - cliques repetidos são ignorados enquanto salva;
 *  - arquivos (fotos/áudios/anexos) não são reenviados pelo salvamento.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/pages/VisitaTecnica.tsx"), "utf8");

describe("H9-G 2B — salvamento canônico da visita", () => {
  it("inclui as notas rápidas no payload de observacoes_tecnicas", () => {
    expect(src).toMatch(/observacoes_tecnicas:\s*\n?\s*serializeNotes\(/);
  });

  it("expõe uma única ação canônica de salvar reutilizada pelos dois botões", () => {
    expect(src).toContain("const salvarCanonico = () =>");
    expect(src).toContain("const handleSaveDraft = salvarCanonico;");
    expect(src).toContain("const handleSaveEdit = salvarCanonico;");
    // não pode haver uma segunda implementação paralela de salvar edição
    expect(src.match(/const handleSaveEdit = \(\) =>/g)).toBeNull();
  });

  it("ignora clique duplo enquanto o salvamento está em andamento", () => {
    expect(src).toContain("if (saveMutation.isPending) return;");
    const guardas = src.match(/if \(saveMutation\.isPending\) return;/g) || [];
    expect(guardas.length).toBeGreaterThanOrEqual(2); // salvar e finalizar
  });

  it("finaliza somente depois de persistir o payload, via RPC auditada", () => {
    const idxUpdate = src.indexOf('.from("registros_consultor")');
    const idxRpc = src.indexOf('rpc_finalizar_visita_v2');
    expect(idxUpdate).toBeGreaterThan(-1);
    expect(idxRpc).toBeGreaterThan(idxUpdate);
    // erro de persistência interrompe antes da finalização
    expect(src).toContain("if (error) throw error;");
  });

  it("não reenvia arquivos já persistidos durante o salvamento", () => {
    expect(src).not.toMatch(/registros_consultor_arquivos"\)\s*\n?\s*\.insert/);
  });
});
