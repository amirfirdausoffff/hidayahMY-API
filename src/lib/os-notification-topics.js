import { firestore } from './firebase-admin';

export const OS_TOPICS = {
  android: 'hidayah_android',
  ios: 'hidayah_ios',
};

const stateRef = (platform) => firestore
  .collection('admin_config').doc(`notification-topic-${platform}`);

export async function getTopicMigration(platform) {
  const snapshot = await stateRef(platform).get();
  if (!snapshot.exists) return { cursor: null, processed: 0, ready: false };
  const state = snapshot.data();
  if (state.version !== 1) throw new Error('Unknown topic migration state');
  return state;
}

export async function saveTopicMigration(platform, state) {
  await stateRef(platform).set({ version: 1, ...state });
}
