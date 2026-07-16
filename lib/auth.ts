import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "snapai_session";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

export interface Invite {
  name: string;
  code: string;
}

/**
 * INVITE_CODES formatnya: "budi:a3f9x2k1,siti:b7k2m9p4,rian:c1x8n3q7"
 *
 * Nama tidak boleh mengandung koma atau titik dua — keduanya dipakai sebagai
 * pemisah. Entri yang melanggar diabaikan, bukan diterima diam-diam.
 */
export function parseInvites(raw: string | undefined): Invite[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(":");
      if (sep === -1) return null;
      const name = entry.slice(0, sep).trim();
      const code = entry.slice(sep + 1).trim();
      if (!name || !code) return null;
      return { name, code };
    })
    .filter((x): x is Invite => x !== null);
}

/** Membandingkan dua string tanpa membocorkan panjang kecocokan lewat waktu. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function sign(payload: string): string | null {
  const secret = process.env.AUTH_SECRET;
  // Fail closed: tanpa secret yang layak, tidak ada token yang bisa dipercaya.
  if (!secret || secret.length < 16) return null;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Sidik jari kode. Inilah yang membuat pencabutan bekerja: token menyimpan
 * sidik jari kode yang dipakai saat login, dan setiap verifikasi mencocokkannya
 * lagi dengan INVITE_CODES yang berlaku saat itu.
 */
function fingerprint(code: string): string | null {
  const sig = sign(`code:${code}`);
  return sig ? sig.slice(0, 16) : null;
}

/**
 * Nama di-encode base64url, bukan encodeURIComponent. Alasannya konkret:
 * encodeURIComponent membiarkan titik apa adanya, sedangkan token dipisah
 * dengan titik — jadi nama seperti "budi.santoso" akan merusak parsing.
 * Alfabet base64url tidak memuat titik.
 */
function encodeName(name: string): string {
  return Buffer.from(name, "utf8").toString("base64url");
}

function decodeName(encoded: string): string | null {
  try {
    const name = Buffer.from(encoded, "base64url").toString("utf8");
    return name || null;
  } catch {
    return null;
  }
}

/** Apakah auth sudah dikonfigurasi? Dipakai halaman login untuk pesan yang jelas. */
export function authConfigError(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    return "AUTH_SECRET belum diset (atau kurang dari 16 karakter).";
  }
  if (parseInvites(process.env.INVITE_CODES).length === 0) {
    return "INVITE_CODES belum diset atau formatnya salah.";
  }
  return null;
}

export function findInvite(code: string): Invite | null {
  const given = code.trim();
  if (!given) return null;

  let found: Invite | null = null;
  // Sengaja tidak break saat ketemu, supaya lama pengecekan tidak bergantung
  // pada posisi kode di dalam daftar.
  for (const invite of parseInvites(process.env.INVITE_CODES)) {
    if (safeEqual(invite.code, given)) found = invite;
  }
  return found;
}

export function createToken(name: string, code: string): string {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const fp = fingerprint(code);
  if (!fp) throw new Error("AUTH_SECRET belum dikonfigurasi.");

  const payload = `${encodeName(name)}.${expiresAt}.${fp}`;
  const signature = sign(payload);
  if (!signature) throw new Error("AUTH_SECRET belum dikonfigurasi.");
  return `${payload}.${signature}`;
}

export function verifyToken(token: string | undefined): { name: string } | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [encodedName, expiresAt, fp, signature] = parts;

  const expected = sign(`${encodedName}.${expiresAt}.${fp}`);
  if (!expected) return null;
  if (!safeEqual(expected, signature)) return null;

  const exp = Number(expiresAt);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;

  const name = decodeName(encodedName);
  if (!name) return null;

  // Pencabutan. Tanda tangan yang sah saja tidak cukup — orangnya harus MASIH
  // terdaftar, dengan kode yang sama seperti saat dia login. Hapus entrinya
  // dari INVITE_CODES dan sesinya mati di request berikutnya; putar kodenya,
  // hasilnya sama. Tanpa database: INVITE_CODES sendiri sumber kebenarannya.
  const invite = parseInvites(process.env.INVITE_CODES).find(
    (i) => i.name === name
  );
  if (!invite) return null;

  const currentFp = fingerprint(invite.code);
  if (!currentFp || !safeEqual(currentFp, fp)) return null;

  return { name };
}
