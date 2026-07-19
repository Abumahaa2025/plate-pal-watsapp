// Service worker: intercepts Web Share Target POST from WhatsApp/other apps
// and stashes the file in a Cache so the page can read it after redirect.
const SHARED_CACHE = "shared-files-v1";
const SHARED_URL = "/__shared-file";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShare(event));
  }
});

async function handleShare(event) {
  try {
    const formData = await event.request.formData();
    const file = formData.get("file");
    if (file && file instanceof File) {
      const cache = await caches.open(SHARED_CACHE);
      await cache.put(
        SHARED_URL,
        new Response(file, {
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-filename": encodeURIComponent(file.name || "shared.xlsx"),
          },
        }),
      );
      return Response.redirect("/?shared=1", 303);
    }
  } catch (e) {
    // fall through
  }
  return Response.redirect("/?shared=0", 303);
}
