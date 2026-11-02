/* Service worker de Money: solo notificaciones push (sin caché de datos financieros). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* payload no JSON */ }
  event.waitUntil(self.registration.showNotification(data.title || "Money", {
    body: data.body || "", icon: "/icons/icon.svg", badge: "/icons/icon.svg", tag: data.tag, data: { url: data.url || "/calendario" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/calendario";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
