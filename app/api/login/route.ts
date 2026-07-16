import { NextResponse } from "next/server";
import {
  findInvite,
  createToken,
  authConfigError,
  SESSION_COOKIE,
  MAX_AGE_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const configError = authConfigError();
  if (configError) {
    return NextResponse.json(
      { error: `Server belum dikonfigurasi: ${configError}` },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body request tidak valid." }, { status: 400 });
  }

  const code = typeof body?.code === "string" ? body.code : "";
  if (!code.trim()) {
    return NextResponse.json({ error: "Kode undangan masih kosong." }, { status: 400 });
  }

  const invite = findInvite(code);
  if (!invite) {
    // Menahan sebentar supaya menebak kode lewat HTTP jadi tidak praktis.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Kode undangan tidak dikenal." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, name: invite.name });
  res.cookies.set(SESSION_COOKIE, createToken(invite.name, invite.code), {
    httpOnly: true, // JavaScript di browser tidak bisa membacanya
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}
