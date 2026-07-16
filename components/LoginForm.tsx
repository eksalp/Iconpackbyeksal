"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ configError }: { configError: string | null }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || loading) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Gagal masuk (${res.status}).`);
      router.replace("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Gagal masuk.");
      setLoading(false);
    }
  }

  if (configError) {
    return (
      <div className="notice notice-error" role="alert">
        <strong>Server belum dikonfigurasi.</strong> {configError} Isi{" "}
        <code>INVITE_CODES</code> dan <code>AUTH_SECRET</code> di{" "}
        <code>.env.local</code> (lokal) atau di Environment Variables (Vercel),
        lalu jalankan ulang.
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="code">
          Kode undangan
        </label>
        <input
          id="code"
          className="input input-mono"
          type="text"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          placeholder="masukkan kode kamu"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <button className="btn-primary" type="submit" disabled={loading || !code.trim()}>
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Memeriksa…
          </>
        ) : (
          "Masuk"
        )}
      </button>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
