"use client";

import { useRef, useEffect } from "react";

interface AudioWaveformProps {
  isActive: boolean;
  mode: "input" | "output";
  className?: string;
}

export function AudioWaveform({
  isActive,
  mode,
  className = "",
}: AudioWaveformProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!isActive) {
      // Draw flat line when inactive
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = mode === "input" ? "#22c55e" : "#3b82f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      return;
    }

    if (mode === "input") {
      // Use microphone input for waveform
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamRef.current = stream;
          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          function draw(): void {
            if (!canvas || !ctx || !analyserRef.current) return;
            animationRef.current = requestAnimationFrame(draw);

            analyserRef.current.getByteTimeDomainData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#22c55e";
            ctx.beginPath();

            const sliceWidth = canvas.width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
              const v = (dataArray[i] ?? 128) / 128.0;
              const y = (v * canvas.height) / 2;

              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
              x += sliceWidth;
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
          }

          draw();
        })
        .catch(() => {
          // Microphone not available, draw animated fake waveform
          drawFakeWaveform(canvas, ctx, mode);
        });
    } else {
      // Output mode — draw animated fake waveform
      drawFakeWaveform(canvas, ctx, mode);
    }

    return (): void => {
      cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isActive, mode]);

  return <canvas ref={canvasRef} width={300} height={40} className={`rounded ${className}`} />;
}

function drawFakeWaveform(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  mode: "input" | "output",
): void {
  let offset = 0;

  function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = mode === "input" ? "#22c55e" : "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x < canvas.width; x++) {
      const y =
        canvas.height / 2 + Math.sin((x + offset) * 0.05) * 8 + Math.sin((x + offset) * 0.1) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
    offset += 2;
    requestAnimationFrame(draw);
  }

  draw();
}
