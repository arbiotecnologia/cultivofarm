import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { CameraCaptureDialog, encerrarStreamDaTentativa } from "@/components/aplicacao/CameraCaptureDialog";

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

  it("ramo sem elemento de vídeo encerra o próprio stream sem tocar em outro", () => {
    const { stream, stop } = streamFalso();
    const ref: { current: MediaStream | null } = { current: stream };
    // video === null é exatamente o ramo !video do diálogo.
    encerrarStreamDaTentativa(stream, null, ref);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(ref.current).toBeNull();
  });

  it("tentativa antiga que falha tarde não derruba a stream da tentativa atual", () => {
    const a = streamFalso();
    const b = streamFalso();
    const ref: { current: MediaStream | null } = { current: b.stream };
    const video = document.createElement("video");
    (video as any).srcObject = b.stream;

    // Falha tardia da tentativa A, já obsoleta.
    encerrarStreamDaTentativa(a.stream, video, ref);

    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).not.toHaveBeenCalled();
    expect(ref.current).toBe(b.stream);
    expect((video as any).srcObject).toBe(b.stream);
  });

  it("na falha da tentativa atual limpa ref e srcObject da própria stream", () => {
    const { stream, stop } = streamFalso();
    const ref: { current: MediaStream | null } = { current: stream };
    const video = document.createElement("video");
    (video as any).srcObject = stream;
    encerrarStreamDaTentativa(stream, video, ref);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(ref.current).toBeNull();
    expect((video as any).srcObject).toBeNull();
  });

  it("o catch externo não encerra stream de outra tentativa quando nenhuma foi obtida", () => {
    const src = require("node:fs").readFileSync("src/components/aplicacao/CameraCaptureDialog.tsx", "utf8");
    expect(src).toContain("if (meuStream) encerrarStreamDaTentativa(meuStream, videoRef.current, streamRef);");
    expect(src).not.toContain("descartar(");
  });
});
