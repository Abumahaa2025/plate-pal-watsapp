import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { getAuthRedirectUrl, SITE_URL } from "@/lib/site";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — لوحاتي" },
      { name: "description", content: "سجّل الدخول لإدارة ملفات لوحات السيارات." },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/plates", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/plates", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        // Create account and activate immediately when Supabase does not
        // require email confirmation (Confirm email = OFF).
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl("/auth"),
            data: { full_name: email.split("@")[0] },
          },
        });
        if (error) throw error;

        if (data.session) {
          toast.success("تم إنشاء الحساب وتفعيله. مرحباً بك!");
          navigate({ to: "/plates", replace: true });
          return;
        }

        // Session missing usually means "Confirm email" is still ON in Supabase.
        // Try immediate sign-in in case the project allows unconfirmed login.
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes("confirm") || msg.includes("not confirmed")) {
            throw new Error(
              "تم إنشاء الحساب لكن تأكيد البريد مفعّل في Supabase. أوقف Confirm email من Authentication → Providers → Email ثم أعد المحاولة.",
            );
          }
          throw signInError;
        }
        if (signInData.session) {
          toast.success("تم إنشاء الحساب وتسجيل الدخول.");
          navigate({ to: "/plates", replace: true });
          return;
        }

        toast.message("تم إنشاء الحساب. سجّل الدخول الآن.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("confirm") || msg.includes("not confirmed")) {
            throw new Error(
              "البريد غير مؤكد. أوقف Confirm email في Supabase أو أكّد بريدك أولاً.",
            );
          }
          throw error;
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    // Always redirect back to the Netlify production URL to avoid localhost 404.
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: SITE_URL,
    });
    if (res.error) toast.error(res.error.message || "تعذّر تسجيل الدخول بجوجل");
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-md rounded-2xl bg-card border shadow-2xl p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2">
            <span className="plate-chip text-lg">لوحاتي</span>
          </div>
          <h1 className="text-2xl font-bold">
            {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            لإدارة أرقام لوحات السيارات
          </p>
        </div>

        <button
          onClick={google}
          className="w-full mb-4 h-11 rounded-lg bg-plate text-plate-foreground font-semibold hover:opacity-90 transition"
        >
          المتابعة بحساب Google
        </button>

        <div className="flex items-center gap-3 my-4 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" /> أو <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm mb-1 block">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 rounded-lg bg-input border px-3 outline-none focus:ring-2 ring-ring"
              placeholder="you@example.com"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-sm mb-1 block">كلمة المرور</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 rounded-lg bg-input border px-3 outline-none focus:ring-2 ring-ring"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-bold hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "جارٍ..." : mode === "signin" ? "دخول" : "إنشاء حساب"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "ليس لديك حساب؟ أنشئ واحداً" : "لديك حساب؟ سجّل الدخول"}
        </button>
      </div>
    </main>
  );
}
