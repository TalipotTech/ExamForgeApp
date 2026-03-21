import type { VoiceService, SpeakOptions, ListenOptions } from "./voice-service";
import { BrowserVoiceService } from "./browser-voice";

type SynthesizeFn = (
  text: string,
  voiceId: string,
  rate?: number,
) => Promise<{ audioBase64: string; contentType: string }>;

export class PremiumVoiceService implements VoiceService {
  private voiceId: string;
  private synthesizeFn: SynthesizeFn;
  private browserSTT: BrowserVoiceService;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private _isSpeaking = false;

  constructor(voiceId: string, synthesizeFn: SynthesizeFn) {
    this.voiceId = voiceId;
    this.synthesizeFn = synthesizeFn;
    this.browserSTT = new BrowserVoiceService();
  }

  async speak(text: string, options?: SpeakOptions): Promise<void> {
    this.stopSpeaking();

    try {
      const result = await this.synthesizeFn(text, this.voiceId, options?.rate ?? 0.9);

      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Decode base64 to ArrayBuffer
      const binaryStr = atob(result.audioBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      this._isSpeaking = true;
      this.currentSource = source;

      return new Promise((resolve) => {
        source.onended = (): void => {
          this._isSpeaking = false;
          this.currentSource = null;
          options?.onEnd?.();
          resolve();
        };
        source.start(0);
      });
    } catch {
      // Fallback to browser TTS if premium fails
      this._isSpeaking = false;
      return this.browserSTT.speak(text, options);
    }
  }

  stopSpeaking(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Already stopped
      }
      this.currentSource = null;
    }
    this._isSpeaking = false;
    this.browserSTT.stopSpeaking();
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  // STT delegates to browser
  startListening(options?: ListenOptions): void {
    this.browserSTT.startListening(options);
  }

  stopListening(): void {
    this.browserSTT.stopListening();
  }

  isListening(): boolean {
    return this.browserSTT.isListening();
  }

  onResult(callback: (transcript: string, isFinal: boolean) => void): void {
    this.browserSTT.onResult(callback);
  }

  onError(callback: (error: string) => void): void {
    this.browserSTT.onError(callback);
  }

  dispose(): void {
    this.stopSpeaking();
    this.browserSTT.dispose();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
