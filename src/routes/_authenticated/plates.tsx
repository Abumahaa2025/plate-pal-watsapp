import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parsePlateFile, naturalCompare, exportPlates, type Plate } from "@/lib/plates";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/_authenticated/plates")({
  component: PlatesPage,
  head: () => ({
    meta: [
      { title: "لوحاتي — قائمة اللوحات" },
      { name: "description", content: "استورد وصدّر وافرز أرقام لوحات السيارات." },
    ],
  }),
});

type SortMode = "asc" | "desc" | "none";
type ActivityFilter = "all" | "import" | "export";
type ActivitySort = "newest" | "oldest";

function PlatesPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [plates, setPlates] = useState<Plate[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("asc");
  const [dedupe, setDedupe] = useState(true);
  const [savedBatches, setSavedBatches] = useState<
    { id: string; name: string; count: number; created_at: string }[]
  >([]);
  const [activity, setActivity] = useState<
    { id: string; action: "import" | "export"; filename: string; format: string | null; count: number; batch_id: string | null; created_at: string }[]
  >([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [activitySort, setActivitySort] = useState<ActivitySort>("newest");
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    loadBatches();
    loadActivity();
    // Pick up file shared from WhatsApp via the service worker cache
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("shared") === "1") {
      pickupSharedFile();
    }
  }, []);

  async function loadActivity() {
    const { data } = await supabase
      .from("plate_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setActivity((data ?? []) as any);
  }

  async function logActivity(entry: { action: "import" | "export"; filename: string; format?: string; count: number; batch_id?: string | null }) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("plate_activity").insert({
      user_id: u.user.id,
      action: entry.action,
      filename: entry.filename,
      format: entry.format ?? null,
      count: entry.count,
      batch_id: entry.batch_id ?? null,
    });
    loadActivity();
  }

  async function deleteActivity(id: string) {
    await supabase.from("plate_activity").delete().eq("id", id);
    setActivity((a) => a.filter((x) => x.id !== id));
  }

  async function clearActivity() {
    if (!confirm("حذف كامل سجل النشاط؟")) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("plate_activity").delete().eq("user_id", u.user.id);
    setActivity([]);
  }

  async function loadBatches() {
    const { data, error } = await supabase
      .from("plate_batches")
      .select("id,name,plates,created_at")
      .order("created_at", { ascending: false });
    if (error) return;
    setSavedBatches(
      (data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        count: Array.isArray(b.plates) ? b.plates.length : 0,
        created_at: b.created_at,
      })),
    );
  }

  async function pickupSharedFile() {
    try {
      const res = await fetch("/__shared-file");
      if (!res.ok) return;
      const name = decodeURIComponent(res.headers.get("x-filename") || "shared.xlsx");
      const buf = await res.arrayBuffer();
      await handleBuffer(buf, name);
      // clear query
      window.history.replaceState({}, "", "/plates");
    } catch {}
  }

  async function handleBuffer(buf: ArrayBuffer, name: string) {
    try {
      const parsed = parsePlateFile(buf, name);
      if (parsed.length === 0) {
        toast.error("لم يتم العثور على أرقام لوحات في الملف");
        return;
      }
      setPlates(parsed);
      setFilename(name);
      toast.success(`تم استيراد ${parsed.length} لوحة من ${name}`);
      logActivity({ action: "import", filename: name, count: parsed.length });
    } catch (e) {
      toast.error("فشل قراءة الملف. تأكد أنه Excel أو CSV صالح.");
    }
  }

  function doExport(list: Plate[], name: string, format: "xlsx" | "csv", batchId?: string | null) {
    exportPlates(list, name, format);
    logActivity({ action: "export", filename: name, format, count: list.length, batch_id: batchId ?? null });
  }

  async function reExportBatch(id: string, name: string, format: "xlsx" | "csv") {
    const { data, error } = await supabase.from("plate_batches").select("plates,name").eq("id", id).single();
    if (error || !data) return toast.error("تعذّر إعادة التصدير");
    const list = (data.plates as unknown as Plate[]) ?? [];
    doExport(list, data.name || name, format, id);
    toast.success("تم إعادة التصدير");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    await handleBuffer(buf, f.name);
    e.target.value = "";
  }

  const processed = useMemo(() => {
    let list = plates;
    if (dedupe) {
      const seen = new Set<string>();
      list = list.filter((p) => {
        const key = p.value.replace(/\s+/g, "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.value.toLowerCase().includes(q));
    }
    if (sort !== "none") {
      list = [...list].sort((a, b) => {
        const c = naturalCompare(a.value, b.value);
        return sort === "asc" ? c : -c;
      });
    }
    return list;
  }, [plates, query, sort, dedupe]);

  async function saveBatch() {
    if (processed.length === 0) return toast.error("لا يوجد ما تحفظه");
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("plate_batches").insert({
      user_id: u.user!.id,
      name: filename || `لوحات ${new Date().toLocaleString("ar")}`,
      plates: processed as unknown as never,
    });
    setLoading(false);
    if (error) return toast.error("فشل الحفظ: " + error.message);
    toast.success("تم حفظ الملف في حسابك");
    loadBatches();
  }

  async function loadBatch(id: string) {
    const { data, error } = await supabase.from("plate_batches").select("*").eq("id", id).single();
    if (error || !data) return toast.error("تعذّر تحميل الملف");
    setPlates((data.plates as unknown as Plate[]) ?? []);
    setFilename(data.name);
    toast.success(`تم تحميل ${data.name}`);
  }

  async function deleteBatch(id: string) {
    if (!confirm("حذف هذا الملف؟")) return;
    const { error } = await supabase.from("plate_batches").delete().eq("id", id);
    if (error) return toast.error("فشل الحذف");
    toast.success("تم الحذف");
    loadBatches();
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const filteredActivity = useMemo(() => {
    let list = activity;
    if (activityFilter !== "all") {
      list = list.filter((a) => a.action === activityFilter);
    }
    return [...list].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return activitySort === "newest" ? tb - ta : ta - tb;
    });
  }, [activity, activityFilter, activitySort]);

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <Toaster richColors position="top-center" />

      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="plate-chip">لوحاتي</span>
          <div>
            <h1 className="text-xl font-bold">إدارة أرقام لوحات السيارات</h1>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <button onClick={signOut} className="text-sm px-3 py-2 rounded-lg border hover:bg-secondary">
          تسجيل الخروج
        </button>
      </header>

      {/* Import card */}
      <section className="rounded-2xl bg-card border p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div>
            <h2 className="font-bold text-lg mb-1">استيراد ملف</h2>
            <p className="text-sm text-muted-foreground">
              اختر ملف Excel أو CSV. يمكنك أيضاً مشاركته من واتساب ← "مشاركة" ← "لوحاتي".
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFile}
              className="hidden"
            />
            <button
              onClick={() => fileInput.current?.click()}
              className="h-11 px-5 rounded-lg bg-primary text-primary-foreground font-bold hover:opacity-90"
            >
              رفع ملف
            </button>
          </div>
        </div>
      </section>

      {/* Controls */}
      {plates.length > 0 && (
        <section className="rounded-2xl bg-card border p-5 mb-6">
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">الملف الحالي</div>
              <div className="font-bold">{filename}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {processed.length} من {plates.length} لوحة
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => doExport(processed, filename, "xlsx")}
                className="h-10 px-4 rounded-lg bg-accent text-accent-foreground font-semibold hover:opacity-90"
              >
                تصدير Excel
              </button>
              <button
                onClick={() => doExport(processed, filename, "csv")}
                className="h-10 px-4 rounded-lg border font-semibold hover:bg-secondary"
              >
                تصدير CSV
              </button>
              <button
                disabled={loading}
                onClick={saveBatch}
                className="h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50"
              >
                حفظ في حسابي
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث…"
              className="h-10 rounded-lg bg-input border px-3 outline-none focus:ring-2 ring-ring md:col-span-2"
            />
            <div className="flex gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="flex-1 h-10 rounded-lg bg-input border px-2"
              >
                <option value="asc">فرز تصاعدي</option>
                <option value="desc">فرز تنازلي</option>
                <option value="none">بدون فرز</option>
              </select>
              <label className="flex items-center gap-2 px-3 rounded-lg border cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={dedupe}
                  onChange={(e) => setDedupe(e.target.checked)}
                />
                إزالة المكرر
              </label>
            </div>
          </div>
        </section>
      )}

      {/* Plate list */}
      {processed.length > 0 && (
        <section className="rounded-2xl bg-card border p-5 mb-6">
          <div className="flex flex-wrap gap-2">
            {processed.slice(0, 500).map((p, i) => (
              <span key={`${p.value}-${i}`} className="plate-chip text-sm">
                {p.value}
              </span>
            ))}
          </div>
          {processed.length > 500 && (
            <p className="text-xs text-muted-foreground mt-3">
              يظهر أول 500 لوحة. صدّر الملف لعرض الكل.
            </p>
          )}
        </section>
      )}

      {/* Saved batches */}
      <section className="rounded-2xl bg-card border p-5">
        <h2 className="font-bold text-lg mb-3">الملفات المحفوظة</h2>
        {savedBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد ملفات محفوظة بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {savedBatches.map((b) => (
              <li key={b.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.count} لوحة · {new Date(b.created_at).toLocaleString("ar")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadBatch(b.id)}
                    className="h-9 px-3 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90"
                  >
                    فتح
                  </button>
                  <button
                    onClick={() => deleteBatch(b.id)}
                    className="h-9 px-3 rounded-lg border text-sm hover:bg-destructive hover:text-destructive-foreground"
                  >
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activity log */}
      <section className="rounded-2xl bg-card border p-5 mt-6">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-bold text-lg">سجل العمليات</h2>
          {activity.length > 0 && (
            <button
              onClick={clearActivity}
              className="text-xs px-3 py-1.5 rounded-lg border hover:bg-destructive hover:text-destructive-foreground"
            >
              مسح السجل
            </button>
          )}
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد عمليات مسجلة بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((a) => {
              const isImport = a.action === "import";
              const batchExists = a.batch_id && savedBatches.some((b) => b.id === a.batch_id);
              return (
                <li key={a.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-md ${
                        isImport
                          ? "bg-primary/15 text-primary"
                          : "bg-accent/20 text-accent-foreground"
                      }`}
                    >
                      {isImport ? "استيراد" : `تصدير${a.format ? " " + a.format.toUpperCase() : ""}`}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.count} لوحة · {new Date(a.created_at).toLocaleString("ar")}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {batchExists && (
                      <>
                        <button
                          onClick={() => loadBatch(a.batch_id!)}
                          className="h-9 px-3 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90"
                        >
                          إعادة فتح
                        </button>
                        <button
                          onClick={() =>
                            reExportBatch(a.batch_id!, a.filename, (a.format as "xlsx" | "csv") || "xlsx")
                          }
                          className="h-9 px-3 rounded-lg border text-sm hover:bg-secondary"
                        >
                          إعادة تصدير
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => deleteActivity(a.id)}
                      className="h-9 px-3 rounded-lg border text-sm hover:bg-destructive hover:text-destructive-foreground"
                    >
                      حذف
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="text-center text-xs text-muted-foreground mt-8">
        نصيحة: افتح التطبيق من الشاشة الرئيسية (تثبيت PWA) لتفعيل الاستقبال المباشر من واتساب.
      </footer>
    </main>
  );
}
