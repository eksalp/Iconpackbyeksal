import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";
import IconStudio from "@/components/IconStudio";
import LogoutButton from "@/components/LogoutButton";

export default async function Page() {
  const store = await cookies();
  const session = verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <h1 className="wordmark">
            Icon<span>Pack</span> Generator
          </h1>
          <div className="masthead-right">
            <span className="masthead-note">Masuk sebagai {session.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="shell">
        <div className="lede">
          <h2>Ikon aplikasi 1024 × 1024, dari satu kalimat.</h2>
          <p>
            Antarmuka web untuk SnapAI. Mesin prompt-nya sama persis dengan
            versi CLI — yang menahan model supaya menggambar subjeknya saja,
            bukan ubin kotak membulat dengan padding kosong di sekelilingnya.
          </p>
        </div>

        <IconStudio />
      </main>

      <footer className="colophon">
        <p>
          Dibangun di atas{" "}
          <a
            href="https://github.com/betomoedano/snapai"
            rel="noopener noreferrer"
          >
            SnapAI
          </a>{" "}
          karya Beto Moedano, lisensi MIT. Logika prompt di{" "}
          <code>lib/icon-prompt.ts</code> dan <code>lib/styleTemplates.ts</code>{" "}
          disalin dari proyek itu tanpa perubahan.
        </p>
        <p>
          Situs ini tidak menyimpan key, prompt, maupun gambar. Biaya generate
          ditanggung akun fal.ai, Google, atau OpenAI milikmu sendiri.
        </p>
      </footer>
    </>
  );
}
