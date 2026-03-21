import type { Database } from "@examforge/shared/db";
import type { TTSProvider } from "./tts-provider.js";
import { AzureSpeechProvider } from "./azure-speech-provider.js";
import { getFlag } from "../feature-flags.js";

export async function getTTSProvider(providerName: string, db: Database): Promise<TTSProvider> {
  if (providerName === "azure") {
    const apiKey = (await getFlag(db, "voice.azure_speech_key")) as string;
    const region = ((await getFlag(db, "voice.azure_speech_region")) as string) ?? "centralindia";
    const voiceIds = (await getFlag(db, "voice.azure_speech_voices")) as string[] | null;

    if (!apiKey) {
      throw new Error("Azure Speech API key not configured. Set it in Admin Settings > Voice.");
    }

    return new AzureSpeechProvider(apiKey, region, voiceIds ?? undefined);
  }

  throw new Error(`Unknown TTS provider: ${providerName}`);
}
