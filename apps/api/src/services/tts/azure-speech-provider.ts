import type { TTSProvider, TTSRequest, TTSResponse, TTSVoiceInfo } from "./tts-provider.js";

const AZURE_VOICES: TTSVoiceInfo[] = [
  {
    id: "en-IN-NeerjaNeural",
    name: "Neerja (Indian English, Female)",
    gender: "female",
    locale: "en-IN",
    provider: "azure",
  },
  {
    id: "en-IN-PrabhatNeural",
    name: "Prabhat (Indian English, Male)",
    gender: "male",
    locale: "en-IN",
    provider: "azure",
  },
  {
    id: "en-IN-AaravNeural",
    name: "Aarav (Indian English, Male)",
    gender: "male",
    locale: "en-IN",
    provider: "azure",
  },
  {
    id: "en-US-JennyNeural",
    name: "Jenny (US English, Female)",
    gender: "female",
    locale: "en-US",
    provider: "azure",
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy (US English, Male)",
    gender: "male",
    locale: "en-US",
    provider: "azure",
  },
  {
    id: "en-GB-SoniaNeural",
    name: "Sonia (British English, Female)",
    gender: "female",
    locale: "en-GB",
    provider: "azure",
  },
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSSML(voiceId: string, text: string, rate?: number): string {
  // Azure SSML prosody rate: "-10%" = 10% slower, "+20%" = 20% faster
  // Convert 0.0-2.0 scale (where 1.0 = normal) to Azure format
  const normalizedRate = rate ?? 0.85; // default slightly slower for clarity
  const percentChange = Math.round((normalizedRate - 1.0) * 100);
  const rateStr = percentChange >= 0 ? `+${percentChange}%` : `${percentChange}%`;
  const locale = voiceId.startsWith("en-IN")
    ? "en-IN"
    : voiceId.startsWith("en-GB")
      ? "en-GB"
      : "en-US";

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">
  <voice name="${voiceId}">
    <prosody rate="${rateStr}">${escapeXml(text)}</prosody>
  </voice>
</speak>`;
}

export class AzureSpeechProvider implements TTSProvider {
  readonly name = "azure";
  private apiKey: string;
  private region: string;
  private allowedVoiceIds: string[];

  constructor(apiKey: string, region: string, allowedVoiceIds?: string[]) {
    this.apiKey = apiKey;
    this.region = region;
    this.allowedVoiceIds = allowedVoiceIds ?? AZURE_VOICES.map((v) => v.id);
  }

  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    const startTime = Date.now();
    const ssml = buildSSML(request.voiceId, request.text, request.rate);
    const outputFormat = request.outputFormat ?? "audio-16khz-128kbitrate-mono-mp3";

    const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": outputFormat,
        "User-Agent": "ExamForge-VoiceTutor",
      },
      body: ssml,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Azure Speech API error ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
    const durationMs = Date.now() - startTime;

    return {
      audioBase64,
      contentType: "audio/mpeg",
      charCount: request.text.length,
      provider: "azure",
      durationMs,
    };
  }

  listVoices(): TTSVoiceInfo[] {
    return AZURE_VOICES.filter((v) => this.allowedVoiceIds.includes(v.id));
  }
}
