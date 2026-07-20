import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  head: () => ({
    meta: [{ title: "جاري تسجيل الدخول — لوحاتي" }],
  }),
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("جاري إكمال تسجيل الدخول عبر Google...");

  useEffect(() => {
    let active = true;

    async function finish() {
      try {
        // PKCE: exchange ?code=... for a session. Hash tokens are also detected.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const exchanged = await supabase.auth.exchangeCodeForSession(code);
            if (exchanged.error) throw exchanged.error;
          }
        }

        const again = await supabase.auth.getSession();
        if (!active) return;
        if (again.data.session) {
          navigate({ to: "/plates", replace: true });
          return;
        }

        setMessage("تعذّر إكمال الجلسة. أعد المحاولة من صفحة تسجيل الدخول.");
        setTimeout(() => navigate({ to: "/auth", replace: true }), 1500);
      } catch (err) {
        if (!active) return;
        setMessage(err instanceof Error ? err.message : "فشل تسجيل الدخول");
        setTimeout(() => navigate({ to: "/auth", replace: true }), 2000);
      }
    }

    void finish();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="text-center max-w-md">
        <div className="mb-4 inline-flex">
          <span className="plate-chip text-lg">لوحاتي</span>
        </div>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
