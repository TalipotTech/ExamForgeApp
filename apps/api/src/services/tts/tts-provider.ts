export interface TTSRequest {
  text: string;
  voiceId: string;
  rate?: number;
  pitch?: string;
  outputFormat?: string;
}

export interface TTSResponse {
  audioBase64: string;
  contentType: string;
  charCount: number;
  provider: string;
  durationMs: number;
}

export interface TTSVoiceInfo {
  id: string;
  name: string;
  gender: string;
  locale: string;
  provider: string;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(request: TTSRequest): Promise<TTSResponse>;
  listVoices(): TTSVoiceInfo[];
}
