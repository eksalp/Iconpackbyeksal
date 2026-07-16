/**
 * Model catalogue. Imported by BOTH the API route and the browser UI, so it must
 * stay free of any SDK imports — otherwise the OpenAI and Gemini SDKs get pulled
 * into the client bundle.
 */

export type ProviderId = "openai" | "gemini" | "fal";

export type ModelId =
  | "fal-ai/nano-banana-2"
  | "fal-ai/janus"
  | "fal-ai/nano-banana"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview"
  | "gemini-2.5-flash-image"
  | "gpt-image-1.5"
  | "gpt-image-1"
  | "gpt-image-2";

export interface ProviderInfo {
  label: string;
  keyLabel: string;
  keyUrl: string;
  placeholder: string;
}

/**
 * Satu tempat untuk semua yang provider-spesifik di UI. Kalau halaman ambil key
 * suatu provider pindah, cukup ubah di sini.
 */
export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  fal: {
    label: "fal.ai",
    keyLabel: "fal.ai API key",
    keyUrl: "https://fal.ai/dashboard/keys",
    placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx",
  },
  gemini: {
    label: "Google AI Studio",
    keyLabel: "Google AI Studio API key",
    keyUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIza...",
  },
  openai: {
    label: "OpenAI",
    keyLabel: "OpenAI API key",
    keyUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
  },
};

/**
 * Menebak provider dari bentuk key-nya. Dipakai untuk menangkap ketidakcocokan
 * SEBELUM request dikirim — kesalahan menempel key fal ke model Google itu
 * kesalahan yang paling mudah dilakukan, dan errornya membingungkan.
 */
export function detectKeyProvider(key: string): ProviderId | null {
  const k = key.trim();
  if (!k) return null;
  if (k.startsWith("sk-")) return "openai";
  if (k.startsWith("AIza")) return "gemini";
  if (/^[0-9a-f-]{30,40}:[0-9a-f]{20,}$/i.test(k)) return "fal";
  return null;
}

export interface ModelInfo {
  id: ModelId;
  provider: ProviderId;
  label: string;
  price: string;
  qualities: string[];
  note?: string;
  deprecated?: string;
  supportsTransparent: boolean;
}

/**
 * Model catalogue. Shared by the API route and the UI, so the two can never
 * drift apart on what a model supports.
 *
 * Prices are indicative per 1024x1024 image and WILL go stale — always check
 * the provider's own pricing page before relying on them.
 */
export const MODELS: Record<ModelId, ModelInfo> = {
  "fal-ai/nano-banana-2": {
    id: "fal-ai/nano-banana-2",
    provider: "fal",
    label: "Nano Banana 2 — lewat fal.ai",
    price: "(2K ×1.5, 4K ×2)",
    qualities: ["1k", "2k", "4k"],
    note: "Model Gemini 3.1 Flash Image yang sama, tapi ditagih ke kredit fal.ai kamu. Tidak perlu billing Google Cloud.",
    supportsTransparent: false,
  },
  "fal-ai/nano-banana": {
    id: "fal-ai/nano-banana",
    provider: "fal",
    label: "Nano Banana — lewat fal.ai",
    price: "",
    qualities: ["1k"],
    deprecated:
      "Model di baliknya (Gemini 2.5 Flash Image) dijadwalkan Google mati 2 Oktober 2026.",
    supportsTransparent: false,
  },
  "fal-ai/janus": {
    id: "fal-ai/janus",
    provider: "fal",
    label: "DeepSeek Janus-Pro — lewat fal.ai",
    price: "",
    qualities: ["1k"],
    note: "Satu-satunya cara memakai model DeepSeek di sini — API resmi DeepSeek tidak bisa membuat gambar. Tapi Janus-Pro model kecil: sebagian besar aturan panjang SnapAI akan diabaikannya, dan hasilnya jauh di bawah Nano Banana. Coba dengan ekspektasi rendah.",
    supportsTransparent: false,
  },
  "gemini-3.1-flash-image-preview": {
    id: "gemini-3.1-flash-image-preview",
    provider: "gemini",
    label: "Nano Banana 2 — Flash",
    price: "",
    qualities: ["1k"],
    note: "Cepat dan murah. Pilihan default yang wajar.",
    supportsTransparent: false,
  },
  "gemini-3-pro-image-preview": {
    id: "gemini-3-pro-image-preview",
    provider: "gemini",
    label: "Nano Banana Pro",
    price: "(1K) & (4K)",
    qualities: ["1k", "2k", "4k"],
    note: "Kualitas tertinggi di sisi Google. Paling mahal.",
    supportsTransparent: false,
  },
  "gemini-2.5-flash-image": {
    id: "gemini-2.5-flash-image",
    provider: "gemini",
    label: "Nano Banana (lawas)",
    price: "",
    qualities: ["1k"],
    deprecated: "Google menjadwalkan model ini mati 2 Oktober 2026.",
    supportsTransparent: false,
  },
  "gpt-image-1.5": {
    id: "gpt-image-1.5",
    provider: "openai",
    label: "GPT Image 1.5",
    price: "",
    qualities: ["auto", "low", "medium", "high"],
    supportsTransparent: true,
  },
  "gpt-image-1": {
    id: "gpt-image-1",
    provider: "openai",
    label: "GPT Image 1",
    price: "",
    qualities: ["auto", "low", "medium", "high"],
    supportsTransparent: true,
  },
  "gpt-image-2": {
    id: "gpt-image-2",
    provider: "openai",
    label: "GPT Image 2",
    price: "",
    qualities: ["auto", "low", "medium", "high"],
    note: "Background transparan tidak didukung model ini.",
    supportsTransparent: false,
  },
};

export const DEFAULT_MODEL: ModelId = "fal-ai/nano-banana-2";
