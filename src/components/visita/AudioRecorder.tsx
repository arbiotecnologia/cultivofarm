import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, Pause, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  onRecorded: (blob: Blob, durationSeconds: number) => void;
  onCleared?: () => void;
  className?: string;
  initialUrl?: string | null;
}

/**
 * Reusable audio recorder using the MediaRecorder API.
 * Records to webm/opus, shows a waveform-less player, and emits
 * a Blob + duration via onRecorded.
 */
export function AudioRecorder({ onRecorded, onCleared, className, initialUrl }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialUrl ?? null);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl && !initialUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        const totalSec = Math.round((Date.now() - startTimeRef.current) / 1000);
        setDuration(totalSec);
        onRecorded(blob, totalSec);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 250);
    } catch (err: any) {
      setPermissionError(
        err?.message || "Não foi possível acessar o microfone. Verifique permissões."
      );
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const clearAudio = () => {
    if (audioUrl && !initialUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDuration(0);
    setElapsed(0);
    setPlaying(false);
    onCleared?.();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    // approximate duration via an Audio element
    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      const sec = Math.round(probe.duration || 0);
      setDuration(sec);
      onRecorded(file, sec);
    };
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("space-y-2 rounded-lg border border-border bg-card p-3", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {!audioUrl && !recording && (
          <>
            <Button type="button" size="sm" variant="default" onClick={startRecording}>
              <Mic className="h-4 w-4 mr-2" />
              Gravar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Anexar arquivo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </>
        )}

        {recording && (
          <Button type="button" size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="h-4 w-4 mr-2" />
            Parar ({formatTime(elapsed)})
          </Button>
        )}

        {audioUrl && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={togglePlay}>
              {playing ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {playing ? "Pausar" : "Reproduzir"}
            </Button>
            <span className="text-sm text-muted-foreground">{formatTime(duration)}</span>
            <Button type="button" size="sm" variant="ghost" onClick={clearAudio}>
              <Trash2 className="h-4 w-4 mr-2" />
              Remover
            </Button>
          </>
        )}
      </div>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="w-full mt-2"
          controls
        />
      )}

      {recording && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          Gravando...
        </div>
      )}

      {permissionError && (
        <p className="text-xs text-destructive">{permissionError}</p>
      )}
    </div>
  );
}
