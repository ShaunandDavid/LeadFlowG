import { initializeApp, cert, getApps, App, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App;

// Initialize Firebase Admin SDK
// Required environment variables:
// - FIREBASE_PROJECT_ID (backend) or VITE_FIREBASE_PROJECT_ID (dev fallback)
// - FIREBASE_SERVICE_ACCOUNT (optional, JSON string for production)
// - Or run with Application Default Credentials (gcloud auth application-default login)
// - Or use Firebase Local Emulator Suite
if (!getApps().length) {
  try {
    // Use backend-specific env var instead of VITE_ prefixed var
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    
    if (!projectId) {
      throw new Error(
        'Missing required FIREBASE_PROJECT_ID environment variable. ' +
        'Set FIREBASE_PROJECT_ID in .env or use VITE_FIREBASE_PROJECT_ID for development.'
      );
    }

    // Check for Firebase emulator
    const useEmulator = process.env.FIREBASE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST;
    
    // In production, credentials should come from service account JSON
    // For development, we can use the Firebase emulator or application default credentials
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : undefined;

    if (serviceAccount) {
      // Production: use service account credentials
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });
    } else if (useEmulator) {
      // Development with emulator: no credentials needed
      console.log('Using Firebase emulator');
      adminApp = initializeApp({
        projectId,
      });
    } else {
      // Try Application Default Credentials (works on GCP or after gcloud auth)
      try {
        adminApp = initializeApp({
          credential: applicationDefault(),
          projectId,
        });
      } catch (adcError) {
        // Fallback for local development: initialize without credentials
        // This will work with public Firebase projects for auth/firestore
        console.warn(
          'Firebase Admin: No service account or ADC found. ' +
          'Initializing with project ID only. ' +
          'Set FIREBASE_SERVICE_ACCOUNT for production or use emulator for development.'
        );
        adminApp = initializeApp({
          projectId,
        });
      }
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
