"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildFinalIconPrompt } from "@/lib/icon-prompt";
import { StyleTemplates } from "@/lib/styleTemplates";
import {
  loadHistory,
  addToHistory,
  markDownloaded,
  removeEntry,
  clearHistory,
  formatWhen,
  type HistoryEntry,
} from "@/lib/history";

import {
  MODELS,
  PROVIDERS,
  DEFAULT_MODEL,
  detectKeyProvider,
  type ModelId,
} from "@/lib/models";

const KEY_STORAGE = "snapai:key";
const FILLERS = [
  "Notes",
  "Clock",
  "Maps",
  "Music",
  "Files",
  "Weather",
  "Camera",
];
const RULER = [180, 120, 60, 40, 29];

export default function IconStudio() {
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [keyLoaded, setKeyLoaded] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [style, setStyle] = useState("");
  const [rawPrompt, setRawPrompt] = useState(false);
  const [useIconWords, setUseIconWords] = useState(false);
  const [quality, setQuality] = useState("1k");
  const [thinking, setThinking] = useState<"minimal" | "max">("minimal");
  const [background, setBackground] = useState("auto");
  const [outputFormat, setOutputFormat] = useState<"png" | "jpeg" | "webp">(
    "png",
  );
  const [count, setCount] = useState(1);
  const [showPrompt, setShowPrompt] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [active, setActive] = useState(0);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeEntryIds, setActiveEntryIds] = useState<string[]>([]);
  const [wall, setWall] = useState<"light" | "dark">("light");
  const [blur, setBlur] = useState(0);

  const info = MODELS[model];
  const provider = PROVIDERS[info.provider];
  const styles = useMemo(() => StyleTemplates.getAvailableStyles(), []);
  const router = useRouter();

  // Ketidakcocokan key vs model ditangkap di sini, sebelum request terkirim.
  const detected = detectKeyProvider(apiKey);
  const mismatch = detected !== null && detected !== info.provider;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY_STORAGE);
      if (saved) {
        setApiKey(saved);
        setRemember(true);
      }
    } catch {
      /* storage blocked — the field just starts empty */
    }
    setKeyLoaded(true);
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (!keyLoaded) return;
    try {
      if (remember && apiKey) window.localStorage.setItem(KEY_STORAGE, apiKey);
      else window.localStorage.removeItem(KEY_STORAGE);
    } catch {
      /* ignore */
    }
  }, [remember, apiKey, keyLoaded]);

  // Keep dependent options legal whenever the model changes.
  useEffect(() => {
    const next = MODELS[model];
    if (!next.qualities.includes(quality)) setQuality(next.qualities[0]);
    if (!next.supportsTransparent && background === "transparent")
      setBackground("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  /**
   * The CLI's --prompt-only, running entirely in the browser. buildFinalIconPrompt
   * is a pure function with no node dependencies, so previewing costs nothing.
   */
  const finalPrompt = useMemo(() => {
    if (!prompt.trim()) return "";
    return buildFinalIconPrompt({
      prompt,
      rawPrompt,
      style: style || undefined,
      useIconWords,
    });
  }, [prompt, rawPrompt, style, useIconWords]);

  const styleIsPreset = style ? styles.includes(style as any) : false;

  async function generate() {
    setError(null);
    if (!apiKey.trim())
      return setError("Tempel API key kamu dulu di panel atas.");
    if (mismatch) {
      return setError(
        `Key ${PROVIDERS[detected!].label} tidak bisa dipakai untuk model yang berjalan di ${provider.label}.`,
      );
    }
    if (!prompt.trim()) return setError("Prompt masih kosong.");

    setLoading(true);
    setImages([]);
    setActive(0);

    const payload = {
      apiKey: apiKey.trim(),
      prompt,
      model,
      style: style || undefined,
      rawPrompt,
      useIconWords,
      quality,
      background,
      outputFormat,
      moderation: "auto",
      thinking,
    };

    try {
      const results = await Promise.allSettled(
        Array.from({ length: count }, () =>
          // The key travels in the POST body, never the URL — query strings end
          // up in access logs.
          fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              const err: any = new Error(
                data.error || `Request gagal (${res.status})`,
              );
              err.status = res.status;
              throw err;
            }
            return data.dataUrl as string;
          }),
        ),
      );

      const ok = results
        .filter(
          (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled",
        )
        .map((r) => r.value);
      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );

      // Sesi habis di tengah jalan — kembalikan ke gerbang, jangan tampilkan
      // error buntu yang tidak bisa ditindaklanjuti.
      if (failed.some((f) => f.reason?.status === 401)) {
        router.replace("/login");
        return;
      }

      if (ok.length === 0) {
        throw new Error(failed[0]?.reason?.message ?? "Gagal generate gambar.");
      }

      setImages(ok);

      const ids: string[] = [];
      for (const dataUrl of ok) {
        const next = await addToHistory(dataUrl, {
          prompt,
          model,
          style,
          quality,
          rawPrompt,
          useIconWords,
        });
        setHistory(next);
        if (next[0]) ids.push(next[0].id);
      }
      setActiveEntryIds(ids);

      if (failed.length > 0) {
        setError(
          `${failed.length} dari ${count} gambar gagal. ${failed[0].reason?.message ?? ""}`,
        );
      }
    } catch (err: any) {
      setError(err?.message ?? "Gagal generate gambar.");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    const url = images[active];
    if (!url) return;
    const mime = url.slice(5, url.indexOf(";"));
    const ext =
      mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const a = document.createElement("a");
    a.href = url;
    a.download = `icon-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    const entryId = activeEntryIds[active];
    if (entryId) setHistory(markDownloaded(entryId));
  }

  /** Riwayat hanya menyimpan thumbnail, jadi yang dipulihkan pengaturannya. */
  function recall(entry: HistoryEntry) {
    setPrompt(entry.prompt);
    setStyle(entry.style);
    setRawPrompt(entry.rawPrompt);
    setUseIconWords(entry.useIconWords);
    if (MODELS[entry.model as ModelId]) setModel(entry.model as ModelId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pendingDownload = history.filter((e) => !e.downloaded).length;

  const current = images[active];

  return (
    <div className="columns">
      {/* ---------------- controls ---------------- */}
      <div>
        <section className="panel">
          <h3 className="panel-title">Kunci API kamu</h3>

          <div className="field">
            <div className="label-row">
              <label className="field-label" htmlFor="key">
                {provider.keyLabel}
              </label>
              <a
                className="key-link"
                href={provider.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                akses api ↗
              </a>
            </div>
            <input
              id="key"
              className="input input-mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          {mismatch && (
            <div className="notice notice-error" role="alert">
              <strong>Key tidak cocok dengan model.</strong> Key ini bentuknya
              key {PROVIDERS[detected!].label}, tapi model yang dipilih berjalan
              di {provider.label}. Ganti model, atau tempel key {provider.label}{" "}
              — ambil di{" "}
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                akses api
              </a>
              .
            </div>
          )}

          <div className="notice notice-warn">
            <strong>Key harus dari provider yang sama dengan model.</strong>{" "}
            Model sekarang berjalan di {provider.label}, jadi yang dibutuhkan{" "}
            {provider.keyLabel}. Key provider lain akan ditolak.
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span className="toggle-copy">
              <strong>Simpan key di browser ini</strong>
              <span>
                Disimpan di localStorage perangkat kamu. Jangan centang di
                komputer bersama.
              </span>
            </span>
          </label>

          <div className="notice notice-warn">
            <strong>Key kamu melewati server situs ini.</strong> Key dipakai
            untuk satu permintaan lalu dibuang — tidak disimpan, tidak dicatat
            di log. Tapi kamu tetap harus mempercayai itu. Kalau ragu, jalankan
            sendiri dari source, dan pakai key yang punya batas belanja.
          </div>
        </section>

        <section className="panel">
          <h3 className="panel-title">Ikon yang kamu mau</h3>

          <div className="field">
            <label className="field-label" htmlFor="prompt">
              Deskripsi
            </label>
            <textarea
              id="prompt"
              className="textarea"
              placeholder="aplikasi cuaca minimalis dengan matahari dan awan"
              maxLength={1000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className="field-hint">
              Tulis subjeknya saja. Sisanya — rasio, komposisi, larangan teks —
              ditambahkan otomatis.{" "}
              <span className="counter">{prompt.length}/1000</span>
            </p>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="model">
              Model
            </label>
            <select
              id="model"
              className="select"
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
            >
              <optgroup label="fal.ai">
                {Object.values(MODELS)
                  .filter((m) => m.provider === "fal")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.price ? ` — ${m.price}` : ""}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Google Gemini (langsung)">
                {Object.values(MODELS)
                  .filter((m) => m.provider === "gemini")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.price ? ` — ${m.price}` : ""}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="OpenAI">
                {Object.values(MODELS)
                  .filter((m) => m.provider === "openai")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.price ? ` — ${m.price}` : ""}
                    </option>
                  ))}
              </optgroup>
            </select>
            {info.note && <p className="field-hint">{info.note}</p>}
            {info.deprecated && (
              <div className="notice notice-warn">
                <strong>Model ini akan dihentikan.</strong> {info.deprecated}{" "}
                Pindah ke Nano Banana 2 sebelum tanggal itu.
              </div>
            )}
          </div>

          <div className="field">
            <span className="field-label">Gaya</span>
            <div className="chips">
              <button
                type="button"
                className="chip"
                aria-pressed={style === ""}
                onClick={() => setStyle("")}
              >
                tanpa gaya
              </button>
              {styles.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  aria-pressed={style === s}
                  onClick={() => setStyle(style === s ? "" : s)}
                >
                  {s}
                </button>
              ))}
            </div>
            {styleIsPreset && (
              <p className="field-hint">
                {StyleTemplates.getStyleDescription(style as any)}
              </p>
            )}
          </div>
        </section>

        <section className="panel">
          <h3 className="panel-title">Pengaturan lanjutan</h3>

          <div className="row">
            <div className="field">
              <label className="field-label" htmlFor="quality">
                Quality
              </label>
              <select
                id="quality"
                className="select"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                {info.qualities.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="count">
                Jumlah variasi
              </label>
              <select
                id="count"
                className="select"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} gambar
                  </option>
                ))}
              </select>
            </div>
          </div>

          {count > 1 && (
            <p className="field-hint">
              Tiap variasi = satu panggilan API terpisah, jadi {count} gambar
              berarti {count}× biaya.
            </p>
          )}

          {model === "gemini-3.1-flash-image-preview" && (
            <div className="field">
              <label className="field-label" htmlFor="thinking">
                Thinking
              </label>
              <select
                id="thinking"
                className="select"
                value={thinking}
                onChange={(e) =>
                  setThinking(e.target.value as "minimal" | "max")
                }
              >
                <option value="minimal">minimal — lebih cepat</option>
                <option value="max">max — penalaran lebih dalam</option>
              </select>
            </div>
          )}

          {info.provider === "openai" && (
            <div className="row">
              <div className="field">
                <label className="field-label" htmlFor="bg">
                  Background
                </label>
                <select
                  id="bg"
                  className="select"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                >
                  <option value="auto">auto</option>
                  <option value="opaque">opaque</option>
                  {info.supportsTransparent && (
                    <option value="transparent">transparent</option>
                  )}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="fmt">
                  Format
                </label>
                <select
                  id="fmt"
                  className="select"
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as any)}
                >
                  <option value="png">png</option>
                  <option value="webp">webp</option>
                  <option value="jpeg">jpeg</option>
                </select>
              </div>
            </div>
          )}

          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={rawPrompt}
                onChange={(e) => setRawPrompt(e.target.checked)}
              />
              <span className="toggle-copy">
                <strong>Prompt mentah</strong>
                <span>
                  Kirim teksmu apa adanya. Semua aturan bawaan dilewati.
                </span>
              </span>
            </label>

            <label className="toggle">
              <input
                type="checkbox"
                checked={useIconWords}
                onChange={(e) => setUseIconWords(e.target.checked)}
              />
              <span className="toggle-copy">
                <strong>Boleh pakai kata &ldquo;icon&rdquo;</strong>
                <span>
                  Framing lebih ikonik, tapi sering menambah padding kosong.
                </span>
              </span>
            </label>
          </div>
        </section>

        <section className="panel">
          <button className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Menggambar…
              </>
            ) : (
              `Buat ikon${count > 1 ? ` (${count})` : ""}`
            )}
          </button>

          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}

          <div
            className="preview-head"
            style={{ marginTop: 16, marginBottom: 0 }}
          >
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowPrompt((v) => !v)}
              aria-expanded={showPrompt}
            >
              {showPrompt ? "Sembunyikan" : "Lihat"} prompt final
            </button>
            <span className="counter">
              {finalPrompt ? `${finalPrompt.length} karakter` : "—"}
            </span>
          </div>

          {showPrompt && (
            <pre className="preview-pre" style={{ marginTop: 10 }}>
              {finalPrompt ||
                "Tulis deskripsi dulu untuk melihat prompt akhirnya."}
            </pre>
          )}
        </section>
      </div>

      {/* ---------------- result ---------------- */}
      <div className="sticky-col">
        <section className="panel">
          <h3 className="panel-title">Hasil — 1024 × 1024</h3>

          <div className="stage">
            {current ? (
              <img src={current} alt="Ikon yang dihasilkan" />
            ) : (
              <p className="stage-empty">
                Belum ada gambar. Isi key dan deskripsi, lalu tekan Buat ikon.
              </p>
            )}
          </div>

          {images.length > 1 && (
            <div className="variants">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  className="variant"
                  aria-pressed={i === active}
                  aria-label={`Variasi ${i + 1}`}
                  onClick={() => setActive(i)}
                >
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}

          {current && (
            <div style={{ marginTop: 12 }}>
              <div
                className="notice notice-warn"
                style={{ marginTop: 0, marginBottom: 10 }}
              >
                <strong>Unduh sekarang.</strong> Gambar ini tidak disimpan di
                mana pun. Muat ulang halaman dan ia hilang — riwayat di bawah
                cuma menyimpan thumbnail kecil, bukan file aslinya.
              </div>
              <button className="btn-primary" onClick={download}>
                Unduh PNG
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <h3 className="panel-title">Cek di home screen</h3>

          <div className="springboard" data-wall={wall}>
            <div
              className="springboard-grid"
              style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined }}
            >
              {Array.from({ length: 8 }, (_, i) => {
                const isSubject = i === 5;
                if (isSubject) {
                  return (
                    <div className="slot" key={i}>
                      <div
                        className={
                          current ? "slot-tile" : "slot-tile slot-filler"
                        }
                      >
                        {current && (
                          <img src={current} alt="Ikon kamu di home screen" />
                        )}
                      </div>
                      <span className="slot-caption">Punyamu</span>
                    </div>
                  );
                }
                const label = FILLERS[i > 5 ? i - 1 : i];
                return (
                  <div className="slot" key={i}>
                    <div className="slot-tile slot-filler" />
                    <span className="slot-caption">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="qa-bar">
            <div className="qa-group">
              <span>Wallpaper</span>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={wall === "light"}
                  onClick={() => setWall("light")}
                >
                  terang
                </button>
                <button
                  type="button"
                  aria-pressed={wall === "dark"}
                  onClick={() => setWall("dark")}
                >
                  gelap
                </button>
              </div>
            </div>

            <div className="qa-group">
              <label htmlFor="blur">Blur</label>
              <input
                id="blur"
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={blur}
                onChange={(e) => setBlur(Number(e.target.value))}
              />
              <span className="counter">{blur}px</span>
            </div>
          </div>

          <p className="field-hint" style={{ marginTop: 10 }}>
            Prompt bawaan SnapAI menyuruh model lolos tiga tes: terbaca saat
            diperkecil, siluetnya masih kebaca saat diburamkan, dan kontras di
            wallpaper terang maupun gelap. Panel ini alat untuk menilai
            ketiganya.
          </p>

          {current && (
            <div className="ruler">
              {RULER.map((size) => (
                <div className="ruler-item" key={size}>
                  <div
                    className="ruler-tile"
                    style={{ width: size, height: size }}
                  >
                    <img src={current} alt="" />
                  </div>
                  <span className="ruler-label">{size}px</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="preview-head">
            <h3 className="panel-title" style={{ marginBottom: 0 }}>
              Riwayat di perangkat ini
            </h3>
            {history.length > 0 && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setHistory(clearHistory());
                  setActiveEntryIds([]);
                }}
              >
                Hapus semua
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="field-hint" style={{ marginTop: 0 }}>
              Belum ada. Ikon yang kamu buat akan muncul di sini sebagai
              thumbnail, tersimpan di browser ini saja.
            </p>
          ) : (
            <>
              {pendingDownload > 0 && (
                <div className="notice notice-warn" style={{ marginTop: 0 }}>
                  <strong>{pendingDownload} ikon belum diunduh.</strong> Yang
                  tersimpan di sini hanya thumbnail — file aslinya sudah hilang
                  dan tidak bisa dikembalikan. Klik entrinya untuk memuat ulang
                  pengaturannya, lalu buat lagi.
                </div>
              )}

              <ul className="history-list">
                {history.map((entry) => (
                  <li key={entry.id} className="history-item">
                    <button
                      type="button"
                      className="history-main"
                      onClick={() => recall(entry)}
                      title="Muat pengaturan ini ke form"
                    >
                      <span className="history-thumb">
                        <img src={entry.thumb} alt="" />
                        {!entry.downloaded && (
                          <span className="history-dot" title="Belum diunduh" />
                        )}
                      </span>
                      <span className="history-body">
                        <span className="history-prompt">{entry.prompt}</span>
                        <span className="history-meta">
                          {formatWhen(entry.createdAt)}
                          {entry.style ? ` · ${entry.style}` : ""}
                          {entry.downloaded ? " · sudah diunduh" : ""}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="history-remove"
                      aria-label="Hapus dari riwayat"
                      onClick={() => setHistory(removeEntry(entry.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              <p className="field-hint">
                Riwayat tersimpan di browser ini saja — tidak terkirim ke
                server, dan tidak muncul di perangkat lain. Membersihkan data
                browser akan menghapusnya.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
