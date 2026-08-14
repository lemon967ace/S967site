/* S967 Firebase Cloud Messaging service worker */
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD1sXOfJ5CZumrZG5ZZWL0TCTlsIh_uGHc",
  authDomain: "s967-52eb4.firebaseapp.com",
  projectId: "s967-52eb4",
  storageBucket: "s967-52eb4.firebasestorage.app",
  messagingSenderId: "1024583311832",
  appId: "1:1024583311832:web:5ebe51bbab0670b44c52ad"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data ?? {};
  const title = data.title || "S967 Chat";
  const body = data.body || "새 채팅 메시지가 있습니다.";
  const roomId = data.room_id || "";
  const url = roomId
  ? `/chat/?room=${encodeURIComponent(roomId)}`
: "/chat/";

  self.registration.showNotification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: roomId ? `s967-chat-${roomId}` : "s967-chat",
    renotify: true,
    data: { url }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/chat/";
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        try {
          if ("navigate" in client) await client.navigate(target);
        } catch {}
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
