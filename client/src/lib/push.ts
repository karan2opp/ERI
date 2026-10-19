import { fetchNotificationConfig, subscribePush, unsubscribePush } from '../services/api';

/** Whether this browser can do push at all (iPhones need the app added to the Home Screen first). */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const registration = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);

/** Is this browser subscribed right now? */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return reg ? reg.pushManager.getSubscription() : null;
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'unavailable';

/** Asks permission, subscribes this browser, and tells the server. */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported';
  const config = await fetchNotificationConfig();
  if (!config.push || !config.publicKey) return 'unavailable';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const reg = await registration();
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) }));
  const json = subscription.toJSON();
  await subscribePush({ endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } });
  return 'enabled';
}

/** Turns push off on this browser and tells the server. */
export async function disablePush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await unsubscribePush(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe();
}
