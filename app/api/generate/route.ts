import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";
import { buildFinalIconPrompt } from "@/lib/icon-prompt";
import { MODELS, type ModelId } from "@/lib/models";
import { redact, generateGemini, generateOpenAI, generateFal } from "@/lib/providers";

export const runtime = "nodejs";

/**
 * Image generation regularly takes 10-60s. Vercel's Hobby plan allows up to
 * 300s. If a deploy rejects this value, lower it — but anything under ~60s
 * will start returning 504s on the Pro image model.
 */
export const maxDuration = 300;

/**
 * One image per request, deliberately.
 *
 * Vercel caps a function's response body at 4.5 MB. A 1024x1024 PNG is roughly
 * 1.5 MB, which becomes ~2 MB once base64-encoded — so two images in one
 * response would already be flirting with the ceiling. The browser fires N
 * parallel requests instead when the user wants variations.
 */
export async function POST(req: Request) {
  // Gerbang yang sesungguhnya. Redirect di halaman hanya kesopanan — tanpa
  // pemeriksaan di sini, siapa pun bisa memanggil endpoint ini langsung.
  const store = await cookies();
  if (!verifyToken(store.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json(
      { error: "Sesi kamu berakhir. Muat ulang halaman dan masukkan kode undangan lagi." },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body request bukan JSON yang valid." }, { status: 400 });
  }

  const {
    apiKey,
    prompt,
    model,
    style,
    rawPrompt,
    useIconWords,
    quality,
    background,
    outputFormat,
    moderation,
    thinking,
  } = body ?? {};

  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return NextResponse.json(
      { error: "API key belum diisi. Tempel key kamu di panel atas dulu." },
      { status: 400 }
    );
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt masih kosong." }, { status: 400 });
  }

  // Mirrors ValidationService.validatePrompt from the CLI.
  if (prompt.length > 1000) {
    return NextResponse.json(
      { error: "Prompt terlalu panjang (maksimal 1000 karakter)." },
      { status: 400 }
    );
  }

  const info = MODELS[model as ModelId];
  if (!info) {
    return NextResponse.json({ error: "Model tidak dikenal." }, { status: 400 });
  }

  if (info.provider === "openai" && !apiKey.trim().startsWith("sk-")) {
    return NextResponse.json(
      { error: "Key OpenAI harus diawali \"sk-\". Kamu mungkin menempel key Gemini." },
      { status: 400 }
    );
  }

  if (!info.qualities.includes(quality)) {
    return NextResponse.json(
      { error: `Quality "${quality}" tidak didukung ${info.label}.` },
      { status: 400 }
    );
  }

  if (background === "transparent" && !info.supportsTransparent) {
    return NextResponse.json(
      { error: `${info.label} tidak mendukung background transparan.` },
      { status: 400 }
    );
  }

  // The exact same prompt builder the CLI uses — copied verbatim, not reimplemented.
  const finalPrompt = buildFinalIconPrompt({
    prompt,
    rawPrompt: Boolean(rawPrompt),
    style: typeof style === "string" && style ? style : undefined,
    useIconWords: Boolean(useIconWords),
  });

  try {
    const image =
      info.provider === "fal"
      ? await generateFal({
          apiKey: apiKey.trim(),
          model: info.id,
          prompt: finalPrompt,
          quality,
        })
      : info.provider === "gemini"
        ? await generateGemini({
            apiKey: apiKey.trim(),
            model: info.id,
            prompt: finalPrompt,
            quality,
            thinking: thinking === "max" ? "max" : "minimal",
          })
        : await generateOpenAI({
            apiKey: apiKey.trim(),
            model: info.id,
            prompt: finalPrompt,
            quality,
            background: background || "auto",
            outputFormat: outputFormat || "png",
            moderation: moderation || "auto",
          });

    return NextResponse.json({
      dataUrl: `data:${image.mime};base64,${image.base64}`,
      mime: image.mime,
      prompt: finalPrompt,
    });
  } catch (error: any) {
    const status = Number(error?.status);

    // Deliberately not console.error(error) — provider SDKs can attach the
    // request (and therefore the key) to the error object.
    const raw = typeof error?.message === "string" ? error.message : "Gagal generate gambar.";
    const message = redact(raw);

    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: "API key ditolak provider. Cek lagi key-nya, dan pastikan billing atau kredit sudah aktif." },
        { status: 400 }
      );
    }

    if (status === 429) {
      return NextResponse.json(
        { error: "Kena rate limit atau kuota habis di akun provider kamu. Tunggu sebentar lalu coba lagi." },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
