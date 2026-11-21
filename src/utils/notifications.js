export { genCode } from '../lib/tableCode.mjs';

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    const permission = await new Promise((resolve, reject) => {
      const p = Notification.requestPermission(resolve);
      if (p && p.then) p.then(resolve).catch(reject);
    });
    return permission;
  } catch (e) {
    return "denied";
  }
}

export function sendLocalNotification(title, body) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;

  const options = {
    body,
    icon: '/kakisplit-logo.png',
    vibrate: [200, 100, 200],
    tag: 'kakisplit-payment',
    renotify: true
  };

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  } catch (e) {
    console.warn("Notification failed:", e);
  }
}
