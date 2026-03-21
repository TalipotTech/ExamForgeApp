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
  private currentAudio: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
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

      // Decode base64 to blob
      const binaryStr = atob(result.audioBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: result.contentType });
      const url = URL.createObjectURL(blob);

      this.currentBlobUrl = url;
      const audio = new Audio(url);
      this.currentAudio = audio;
      this._isSpeaking = true;

      return new Promise((resolve, reject) => {
        audio.onended = (): void => {
          this._isSpeaking = false;
          this.cleanupAudio();
          options?.onEnd?.();
          resolve();
        };
        audio.onerror = (): void => {
          this._isSpeaking = false;
          this.cleanupAudio();
          // Fallback to browser TTS
          this.browserSTT.speak(text, options).then(resolve, reject);
        };
        audio.play().catch(() => {
          this._isSpeaking = false;
          this.cleanupAudio();
          // Fallback to browser TTS on autoplay block
          this.browserSTT.speak(text, options).then(resolve, reject);
        });
      });
    } catch {
      this._isSpeaking = false;
      return this.browserSTT.speak(text, options);
    }
  }

  private cleanupAudio(): void {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    this.currentAudio = null;
  }

  stopSpeaking(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    this.cleanupAudio();
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
  }
}
