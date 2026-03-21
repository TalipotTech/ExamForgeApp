export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  voice?: string;
  onEnd?: () => void;
}

export interface ListenOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  timeout?: number;
}

export interface VoiceService {
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stopSpeaking(): void;
  isSpeaking(): boolean;

  startListening(options?: ListenOptions): void;
  stopListening(): void;
  isListening(): boolean;
  onResult: (callback: (transcript: string, isFinal: boolean) => void) => void;
  onError: (callback: (error: string) => void) => void;

  dispose(): void;
}

export interface VoiceCapabilities {
  ttsSupported: boolean;
  sttSupported: boolean;
  ttsProvider: "browser" | "premium";
  sttProvider: "browser" | "premium";
}

export function detectVoiceCapabilities(): VoiceCapabilities {
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const sttSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return {
    ttsSupported,
    sttSupported,
    ttsProvider: "browser",
    sttProvider: "browser",
  };
}
