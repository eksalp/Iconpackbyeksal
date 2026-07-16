import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, authConfigError, SESSION_COOKIE } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const store = await cookies();
  if (verifyToken(store.get(SESSION_COOKIE)?.value)) {
    redirect("/");
  }

  return (
    <main className="gate">
      <div className="gate-card">
        <h1 className="wordmark" style={{ marginBottom: 4 }}>
          Icon<span>Pack</span> Generator
        </h1>
        <p className="gate-lede">
          Alat ini masih tertutup. Masukkan kode undangan untuk melanjutkan.
        </p>
        <LoginForm configError={authConfigError()} />
        <p className="gate-foot">
          Kamu tetap memakai API key sendiri setelah masuk. Kode ini hanya
          menentukan siapa yang boleh membuka halamannya.
        </p>
      </div>
    </main>
  );
}
