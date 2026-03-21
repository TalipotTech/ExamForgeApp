import type { VoiceService, SpeakOptions, ListenOptions } from "./voice-service";

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

/**
 * Pick the best English voice available, preferring Indian English.
 * Falls back to any en-* voice, then US/UK English.
 */
function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Priority 1: Indian English voices
  const indian = voices.find(
    (v) =>
      v.lang === "en-IN" ||
      v.name.toLowerCase().includes("india") ||
      v.name.toLowerCase().includes("rishi") ||
      v.name.toLowerCase().includes("veena"),
  );
  if (indian) return indian;

  // Priority 2: Any English voice (en-US, en-GB, en-AU etc.)
  const english = voices.find((v) => v.lang.startsWith("en"));
  if (english) return english;

  // Priority 3: Voice with "english" in name
  const namedEnglish = voices.find((v) => v.name.toLowerCase().includes("english"));
  if (namedEnglish) return namedEnglish;

  return null;
}

export class BrowserVoiceService implements VoiceService {
  private synthesis: SpeechSynthesis;
  private recognition: SpeechRecognition | null = null;
  private resultCallbacks: Array<(transcript: string, isFinal: boolean) => void> = [];
  private errorCallbacks: Array<(error: string) => void> = [];
  private _isListening = false;
  private _isSpeaking = false;
  private listenTimeout: ReturnType<typeof setTimeout> | null = null;
  private cachedVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;

  constructor() {
    this.synthesis = window.speechSynthesis;

    // Voices load asynchronously in most browsers — cache when ready
    const loadVoices = (): void => {
      const voices = this.synthesis.getVoices();
      if (voices.length > 0) {
        this.cachedVoice = pickEnglishVoice(voices);
        this.voicesLoaded = true;
      }
    };

    // Try immediately (works in Firefox)
    loadVoices();

    // Listen for async load (Chrome, Edge, Safari)
    if (!this.voicesLoaded) {
      this.synthesis.addEventListener("voiceschanged", loadVoices);
    }

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

  /** Get all English voices available on this device */
  getEnglishVoices(): Array<{ name: string; lang: string; uri: string }> {
    const voices = this.synthesis.getVoices();
    return voices
      .filter((v) => v.lang.startsWith("en"))
      .map((v) => ({ name: v.name, lang: v.lang, uri: v.voiceURI }));
  }

  /** Set a specific voice by name */
  setVoiceByName(name: string): void {
    const voices = this.synthesis.getVoices();
    const match = voices.find((v) => v.name === name);
    if (match) {
      this.cachedVoice = match;
    }
  }

  /** Get the currently selected voice name */
  getSelectedVoiceName(): string | null {
    return this.cachedVoice?.name ?? null;
  }

  async speak(text: string, options?: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 0.9;
      utterance.pitch = options?.pitch ?? 1.0;

      // Use cached voice, or try to find one now
      if (!this.cachedVoice) {
        const voices = this.synthesis.getVoices();
        if (voices.length > 0) {
          this.cachedVoice = pickEnglishVoice(voices);
        }
      }

      if (this.cachedVoice) {
        utterance.voice = this.cachedVoice;
        utterance.lang = this.cachedVoice.lang;
      } else {
        utterance.lang = "en-IN";
      }

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
