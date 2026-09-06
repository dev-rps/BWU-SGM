import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase Web SDK config keys are safe to expose in client code.
// They simply identify the project and do not grant administrative access.
// The actual security is enforced via Firestore Security Rules.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA3nYYy-7BXferfR-ZVpDn5fkYr3PfM4dw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "safety-guardian-ab1f1.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "safety-guardian-ab1f1",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "safety-guardian-ab1f1.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "74070820570",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:74070820570:web:078f351d3b19af540147e3",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;     