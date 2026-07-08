import admin from 'firebase-admin';

if (!admin.getApps().length) {
  try {
    // Initialize with service account JSON if provided in env
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      // Fallback to default initialization (works in some Vercel/GCP environments automatically)
      admin.initializeApp();
    }
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export const verifyIdToken = async (token) => {
  if (!token) throw new Error("No token provided");
  return await admin.auth().verifyIdToken(token);
};

export default admin;
