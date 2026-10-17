// Web Push only (no caching). Payload: { title, body, url, tag } from src/server/push.ts.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const d = event.data.json();
  event.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,
      icon: "/favicon.ico",
      data: { url: d.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/notifications",
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        const open = wins.find(
          (w) => new URL(w.url).origin === self.location.origin,
        );
        if (open) return open.focus().then(() => open.navigate(url));
        return self.clients.openWindow(url);
      }),
  );
});
