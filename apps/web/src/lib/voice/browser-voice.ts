import type { VoiceService, SpeakOptions, ListenOptions } from "./voice-service";

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export class BrowserVoiceService implements VoiceService {
  private synthesis: SpeechSynthesis;
  private recognition: SpeechRecognition | null = null;
  private resultCallbacks: Array<(transcript: string, isFinal: boolean) => void> = [];
  private errorCallbacks: Array<(error: string) => void> = [];
  private _isListening = false;
  private _isSpeaking = false;
  private listenTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionCtor) {
      this.recognition = new SpeechRecognitionCtor();
      this.recognition.lang = "en-IN";
      this.recognition.interimResults = true;
      this.recognition.continuous = false;

      this.recognition.onresult = (event: SpeechRecognitionEvent): void => {
        const last = event.results[event.results.length - 1];
        if (last) {
          const transcript = last[0].transcript;
          const isFinal = last.isFinal;
          this.resultCallbacks.forEach((cb) => cb(transcript, isFinal));
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent): void => {
        if (event.error !== "aborted" && event.error !== "no-speech") {
          this.errorCallbacks.forEach((cb) => cb(event.error));
        }
        this._isListening = false;
      };

      this.recognition.onend = (): void => {
        this._isListening = false;
      };
    }
  }

  async speak(text: string, options?: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 0.9;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.lang = "en-IN";

      // Try to find an Indian English voice
      const voices = this.synthesis.getVoices();
      const indianVoice = voices.find(
        (v) =>
          v.lang === "en-IN" ||
          v.name.toLowerCase().includes("india") ||
          v.name.toLowerCase().includes("rishi"),
      );
      if (indianVoice) utterance.voice = indianVoice;

      this._isSpeaking = true;

      utterance.onend = (): void => {
        this._isSpeaking = false;
        options?.onEnd?.();
        resolve();
      };

      utterance.onerror = (): void => {
        this._isSpeaking = false;
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking(): void {
    this.synthesis.cancel();
    this._isSpeaking = false;
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  startListening(options?: ListenOptions): void {
    if (!this.recognition) {
      this.errorCallbacks.forEach((cb) => cb("Speech recognition not supported in this browser"));
      return;
    }

    if (this._isListening) {
      this.recognition.abort();
    }

    if (options?.language) this.recognition.lang = options.language;
    if (options?.continuous !== undefined) this.recognition.continuous = options.continuous;
    if (options?.interimResults !== undefined)
      this.recognition.interimResults = options.interimResults;

    this._isListening = true;

    try {
      this.recognition.start();
    } catch {
      // Already started — ignore
    }

    // Auto-stop after timeout
    const timeout = options?.timeout ?? 15000;
    if (this.listenTimeout) clearTimeout(this.listenTimeout);
    this.listenTimeout = setTimeout(() => {
      if (this._isListening) {
        this.stopListening();
        this.errorCallbacks.forEach((cb) => cb("timeout"));
      }
    }, timeout);
  }

  stopListening(): void {
    if (this.listenTimeout) {
      clearTimeout(this.listenTimeout);
      this.listenTimeout = null;
    }
    if (this.recognition && this._isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Already stopped
      }
    }
    this._isListening = false;
  }

  isListening(): boolean {
    return this._isListening;
  }

  onResult(callback: (transcript: string, isFinal: boolean) => void): void {
    this.resultCallbacks.push(callback);
  }

  onError(callback: (error: string) => void): void {
    this.errorCallbacks.push(callback);
  }

  dispose(): void {
    this.stopSpeaking();
    this.stopListening();
    this.resultCallbacks = [];
    this.errorCallbacks = [];
  }
}
