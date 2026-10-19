// Push notifications for alerts (price levels, signal changes, earnings, ex-dividend, fund filings).
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'TradeCompass', body: 'New alert' };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon.svg', data: { url: data.url || '/' } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
