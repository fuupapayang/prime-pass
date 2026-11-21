/* PRIME PASS service worker（プッシュ通知・ホーム画面に追加） */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyC8f-gfj7rVvrkXwErw1bdC5HMixpI9kfA',
  authDomain: 'smipocket-stg.firebaseapp.com',
  projectId: 'smipocket-stg',
  storageBucket: 'smipocket-stg.firebasestorage.app',
  messagingSenderId: '246405644992',
  appId: '1:246405644992:web:9eec0977df22bfc30c2325',
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  // notification ペイロードは、ブラウザが自動で表示する。data のみの場合だけ、ここで表示する
  if (!payload.notification && payload.data) {
    self.registration.showNotification(payload.data.title || 'PRIME PASS', { body: payload.data.body || '', icon: 'icons/icon-192.png' });
  }
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.fcmOptions && e.notification.data.FCM_MSG.fcmOptions.link) || './#/notices';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate && c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // 常に最新を表示（キャッシュしない）
