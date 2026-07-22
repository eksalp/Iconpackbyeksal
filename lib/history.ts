/**
 * Riwayat lokal — HANYA thumbnail.
 *
 * Kenapa bukan gambar penuh: kuota localStorage sekitar 5 MB, sedangkan satu PNG
 * 1024x1024 menjadi ~2 MB setelah base64. Dua gambar saja sudah penuh. Jadi yang
 * disimpan thumbnail JPEG kecil (~6 KB), dan gambar aslinya TIDAK bisa
 * dikembalikan dari sini.
 *
 * Konsekuensinya jujur: riwayat ini alat mengingat, bukan cadangan. Yang membuatnya
 * tetap berguna adalah prompt dan pengaturannya ikut tersimpan — cukup untuk
 * membuat ulang, bukan untuk mengunduh ulang.
 */

const STORAGE_KEY = "snapai:history";
const MAX_ENTRIES = 30;
const THUMB_SIZE = 160;

export interface HistoryEntry {
  id: string;
  thumb: string;
  prompt: string;
  model: string;
  style: string;
  quality: string;
  rawPrompt: boolean;
  useIconWords: boolean;
  createdAt: number;
  downloaded: boolean;
}

/** Mengecilkan data URL jadi thumbnail JPEG lewat canvas. */
export function makeThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_SIZE;
        canvas.height = THUMB_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas tidak tersedia."));
        ctx.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE);
        // JPEG, bukan PNG: ikon biasanya ~6 KB begini, versus ~40 KB kalau PNG.
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Gagal memuat gambar."));
    img.src = dataUrl;
  });
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        e && typeof e.id === "string" && typeof e.thumb === "string",
    );
  } catch {
    // Data rusak atau storage diblokir — perlakukan sebagai riwayat kosong
    // daripada meledakkan halaman.
    return [];
  }
}

/**
 * Menulis riwayat, memangkas dari yang terlama sampai muat.
 *
 * Kuota bisa habis lebih cepat dari perkiraan kalau situs lain di origin yang
 * sama ikut memakainya, jadi jangan berasumsi MAX_ENTRIES selalu tercapai —
 * kurangi dan coba lagi sampai berhasil.
 */
function persist(entries: HistoryEntry[]): HistoryEntry[] {
  let working = entries.slice(0, MAX_ENTRIES);

  while (working.length > 0) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(working));
      return working;
    } catch {
      working = working.slice(0, working.length - 1);
    }
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage diblokir sepenuhnya */
  }
  return [];
}

export async function addToHistory(
  dataUrl: string,
  meta: Omit<HistoryEntry, "id" | "thumb" | "createdAt" | "downloaded">,
): Promise<HistoryEntry[]> {
  let thumb: string;
  try {
    thumb = await makeThumbnail(dataUrl);
  } catch {
    return loadHistory();
  }

  const entry: HistoryEntry = {
    ...meta,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    thumb,
    createdAt: Date.now(),
    downloaded: false,
  };

  return persist([entry, ...loadHistory()]);
}

export function markDownloaded(id: string): HistoryEntry[] {
  return persist(
    loadHistory().map((e) => (e.id === id ? { ...e, downloaded: true } : e)),
  );
}

export function removeEntry(id: string): HistoryEntry[] {
  return persist(loadHistory().filter((e) => e.id !== id));
}

export function clearHistory(): HistoryEntry[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return [];
}

export function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}
