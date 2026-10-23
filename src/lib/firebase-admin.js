import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

let app;
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  app = initializeApp({
    credential: cert(serviceAccount),
    projectId: 'hidayah-my',
  });
} else {
  app = getApp();
}

export const messaging = getMessaging(app);
export const firestore = getFirestore(app);
export default app;
