import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { ModelId } from "./models";

export interface GenImage {
  base64: string;
  mime: string;
}

/**
 * Scrubs anything that looks like an API key out of a string before it is ever
 * returned to the browser or written to a log. Provider SDKs occasionally echo
 * request context into error messages, and this app handles other people's keys.
 */
export function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***REDACTED***")
    .replace(/AIza[A-Za-z0-9_\-]{8,}/g, "AIza***REDACTED***");
}

function qualityToImageSize(q: string): "1K" | "2K" | "4K" {
  if (q === "2k") return "2K";
  if (q === "4k") return "4K";
  return "1K";
}

export async function generateGemini(opts: {
  apiKey: string;
  model: ModelId;
  prompt: string;
  quality: string;
  thinking?: "minimal" | "max";
}): Promise<GenImage> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });

  const config: Record<string, unknown> = {
    responseModalities: ["IMAGE", "TEXT"],
  };

  if (opts.model === "gemini-3.1-flash-image-preview") {
    config.imageConfig = { imageSize: "1K" };
    config.thinkingConfig = {
      thinkingLevel: opts.thinking === "max" ? "HIGH" : "MINIMAL",
    };
  } else if (opts.model === "gemini-3-pro-image-preview") {
    config.imageConfig = { imageSize: qualityToImageSize(opts.quality) };
  }

  const res = await ai.models.generateContent({
    model: opts.model,
    config,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
  });

  const parts = (res as any)?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const inline = part?.inlineData;
      if (inline?.data) {
        return { base64: inline.data, mime: inline.mimeType || "image/png" };
      }
    }
  }

  throw new Error(
    "Gemini tidak mengembalikan gambar. Biasanya karena prompt kena filter keamanan, atau kuota API key kamu habis."
  );
}

export async function generateOpenAI(opts: {
  apiKey: string;
  model: ModelId;
  prompt: string;
  quality: string;
  background: string;
  outputFormat: "png" | "jpeg" | "webp";
  moderation: string;
}): Promise<GenImage> {
  const client = new OpenAI({ apiKey: opts.apiKey });

  const res = await client.images.generate({
    model: opts.model,
    prompt: opts.prompt,
    n: 1,
    size: "1024x1024",
    quality: opts.quality,
    background: opts.background,
    output_format: opts.outputFormat,
    moderation: opts.moderation,
  } as any);

  const b64 = (res as any)?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI tidak mengembalikan data gambar.");
  }

  const mime =
    opts.outputFormat === "jpeg"
      ? "image/jpeg"
      : opts.outputFormat === "webp"
        ? "image/webp"
        : "image/png";

  return { base64: b64, mime };
}

/**
 * fal.ai proxies the same Gemini image models we already use, so the SnapAI
 * prompt builder keeps working unchanged. Deliberately raw fetch against the
 * synchronous fal.run endpoint rather than @fal-ai/client — the SDK would only
 * add a dependency to send one POST.
 */
export async function generateFal(opts: {
  apiKey: string;
  model: ModelId;
  prompt: string;
  quality: string;
}): Promise<GenImage> {
  // Tiap model di fal punya skema input sendiri, jadi body dibangun terpisah
  // daripada satu objek yang ditambal-tambal.
  let body: Record<string, unknown>;

  if (opts.model === "fal-ai/janus") {
    // Janus-Pro (DeepSeek) memakai image_size, bukan resolution/aspect_ratio.
    body = {
      prompt: opts.prompt,
      image_size: "square_hd",
      num_images: 1,
      enable_safety_checker: true,
      sync_mode: true,
    };
  } else {
    body = {
      prompt: opts.prompt,
      num_images: 1,
      aspect_ratio: "1:1",
      output_format: "png",
      // Mengembalikan data URI, bukan URL hosted — sekaligus menjaga gambar
      // tidak tersimpan di request history fal.
      sync_mode: true,
      // Mencegah model memutuskan sendiri mengembalikan beberapa gambar.
      limit_generations: true,
    };
    if (opts.model === "fal-ai/nano-banana-2") {
      body.resolution = opts.quality.toUpperCase(); // 1K | 2K | 4K
    }
  }

  const res = await fetch(`https://fal.run/${opts.model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err: any = new Error(
      redact(detail.slice(0, 300)) || `fal.ai menolak request (${res.status}).`
    );
    err.status = res.status;
    throw err;
  }

  const data: any = await res.json();
  const first = data?.images?.[0];
  if (!first?.url) {
    throw new Error(
      "fal.ai tidak mengembalikan gambar. Prompt mungkin kena filter keamanan, atau kredit kamu habis."
    );
  }

  const mime: string = first.content_type || "image/png";

  // sync_mode should give us a data URI, but fal can still hand back a hosted
  // URL — handle both rather than trusting one shape.
  if (typeof first.url === "string" && first.url.startsWith("data:")) {
    return { base64: first.url.slice(first.url.indexOf(",") + 1), mime };
  }

  const binary = await fetch(first.url);
  if (!binary.ok) throw new Error("Gagal mengunduh gambar dari fal.ai.");
  const buf = Buffer.from(await binary.arrayBuffer());
  return { base64: buf.toString("base64"), mime };
}
