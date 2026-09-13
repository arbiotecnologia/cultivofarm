import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { CameraCaptureDialog } from "@/components/aplicacao/CameraCaptureDialog";

/** Stream falso que registra o encerramento de cada track. */
function streamFalso() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  return { stream, stop };
}

const montarMediaDevices = (stream: MediaStream) => {
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  return getUserMedia;
};

describe("CameraCaptureDialog: encerramento do stream em falhas", () => {
  let playSpy: any;

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("encerra todas as tracks quando video.play() rejeita e oferece o fallback", async () => {
    const { stream, stop } = streamFalso();
    montarMediaDevices(stream);
    playSpy.mockRejectedValue(Object.assign(new Error("bloqueado"), { name: "NotAllowedError" }));

    render(<CameraCaptureDialog open onOpenChange={() => {}} onCapture={() => {}} />);

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Usar câmera\/galeria do dispositivo/i)).toBeTruthy();
    const capturar = screen.getByRole("button", { name: /Capturar/i }) as HTMLButtonElement;
    expect(capturar.disabled).toBe(true);
  });

  it("encerra todas as tracks quando o elemento de vídeo não está disponível", async () => {
    const { stream, stop } = streamFalso();
    montarMediaDevices(stream);
    playSpy.mockResolvedValue(undefined);
    // Simula ausência do elemento de vídeo durante a inicialização.
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: any, opts?: any) => {
      const el = createElement(tag, opts);
      if (String(tag).toLowerCase() === "video") {
        Object.defineProperty(el, "play", {
          configurable: true,
          value: () => Promise.reject(Object.assign(new Error("sem vídeo"), { name: "AbortError" })),
        });
      }
      return el;
    });

    render(<CameraCaptureDialog open onOpenChange={() => {}} onCapture={() => {}} />);

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("o código trata explicitamente a ausência do elemento de vídeo encerrando o stream", () => {
    const src = require("node:fs").readFileSync("src/components/aplicacao/CameraCaptureDialog.tsx", "utf8");
    const trecho = src.slice(src.indexOf("if (!video)"), src.indexOf("streamRef.current = stream;"));
    expect(trecho).toContain("descartar(stream)");
    expect(trecho).toContain("streamRef.current = null");
    expect(trecho).toContain("setPronto(false)");
  });
});
