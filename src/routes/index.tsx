import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    // Handle Web Share Target return from WhatsApp — the service worker
    // already stashed the file in cache; the plates page will pick it up.
    supabase.auth.getSession().then(({ data }) => {
      navigate({
        to: data.session ? "/plates" : "/auth",
        replace: true,
        search: (prev) => prev,
      });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="text-center max-w-lg">
        <div className="mb-4 inline-flex"><span className="plate-chip text-xl">لوحاتي</span></div>
        <h1 className="text-3xl font-bold mb-3">إدارة أرقام لوحات السيارات</h1>
        <p className="text-muted-foreground">
          استورد ملفات Excel/CSV، افرزها، وصدّرها. يدعم استلام الملفات من واتساب مباشرة.
        </p>
      </div>
    </main>
  );
}
