import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export let db: any = null;
export let auth: any = null;
export let googleProvider: GoogleAuthProvider | null = null;
export let isFirebaseEnabled = false;

// Check if config is a real configuration and not placeholder
if (
  firebaseConfig &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "PLACEHOLDER_KEY" &&
  firebaseConfig.projectId !== "placeholder-project"
) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    isFirebaseEnabled = true;
    console.log("Firebase initialized successfully with config:", firebaseConfig.projectId);
  } catch (error) {
    console.warn("Unable to initialize Firebase. Falling back to local storage:", error);
  }
} else {
  console.log("Using Local Offline Engine. Firebase credentials are not yet configured.");
}

// Security & Error Diagnostics block matching skill requirements
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || false,
      isAnonymous: auth?.currentUser?.isAnonymous || false,
    },
    operationType,
    path
  };
  console.error('Firestore Hardened Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// User Profile persistence adapters
export async function saveUserData(userId: string, data: any) {
  if (isFirebaseEnabled && db) {
    try {
      await setDoc(doc(db, "users", userId), data, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
    }
  }
}

export async function getUserData(userId: string): Promise<any | null> {
  if (isFirebaseEnabled && db) {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      if (snap.exists()) return snap.data();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${userId}`);
    }
  }
  return null;
}

// Cloud Persistence: Favorite Itineraries handlers
export async function saveFavoriteItinerary(userId: string, plan: any) {
  if (!isFirebaseEnabled || !db) {
    throw new Error("Firebase is not initialized.");
  }
  const path = `users/${userId}/favorites/${plan.id}`;
  try {
    const payload = {
      id: plan.id,
      userId: userId,
      date: plan.date || new Date().toISOString().split('T')[0],
      locationName: plan.locationName,
      summary: plan.summary,
      items: plan.items || [],
      transportMode: plan.transportMode || "walking",
      suitabilityScore: plan.suitabilityScore || 85,
      userRating: plan.userRating || 5,
      savedAt: new Date().toISOString()
    };
    await setDoc(doc(db, "users", userId, "favorites", plan.id), payload);
    return payload;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateFavoriteItineraryRating(userId: string, planId: string, rating: number) {
  if (!isFirebaseEnabled || !db) {
    throw new Error("Firebase is not initialized.");
  }
  const path = `users/${userId}/favorites/${planId}`;
  try {
    await setDoc(doc(db, "users", userId, "favorites", planId), { userRating: rating }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteFavoriteItinerary(userId: string, planId: string) {
  if (!isFirebaseEnabled || !db) {
    throw new Error("Firebase is not initialized.");
  }
  const path = `users/${userId}/favorites/${planId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "favorites", planId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function getFavoriteItineraries(userId: string): Promise<any[]> {
  if (!isFirebaseEnabled || !db) {
    return [];
  }
  const path = `users/${userId}/favorites`;
  try {
    const q = query(collection(db, "users", userId, "favorites"), orderBy("savedAt", "desc"));
    const snap = await getDocs(q);
    const results: any[] = [];
    snap.forEach((doc) => {
      results.push(doc.data());
    });
    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}
export type { FirebaseUser };
