import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App;

// Initialize Firebase Admin SDK
if (!getApps().length) {
  try {
    // Use backend-specific env var instead of VITE_ prefixed var
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    
    if (!projectId) {
      throw new Error('Missing required FIREBASE_PROJECT_ID environment variable');
    }

    // In production, credentials should come from service account JSON
    // For development, we can use the Firebase emulator or application default credentials
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : undefined;

    if (serviceAccount) {
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
    } else {
      // Use application default credentials in development
      adminApp = initializeApp({
        projectId,
      });
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    throw error;
  }
} else {
  adminApp = getApps()[0];
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export { adminApp };
