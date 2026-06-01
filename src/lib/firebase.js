import { initializeApp, getApps } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

const defaultWebFirebaseConfig = {
  apiKey: "AIzaSyC8HoWaAu0XWy3he_pMxqUIWwREDPdeUpg",
  authDomain: "talibclub.org",
  projectId: "talib-club-web",
  storageBucket: "talib-club-web.firebasestorage.app",
  messagingSenderId: "300903382422",
  appId: "1:300903382422:web:887e6f03a6c4f0092db1b7",
  measurementId: "G-CQ5R964GMN",
}

const webFirebaseConfig = {
  apiKey: import.meta.env.VITE_WEB_FIREBASE_API_KEY || defaultWebFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_WEB_FIREBASE_AUTH_DOMAIN || defaultWebFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_WEB_FIREBASE_PROJECT_ID || defaultWebFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_WEB_FIREBASE_STORAGE_BUCKET || defaultWebFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_WEB_FIREBASE_MESSAGING_SENDER_ID || defaultWebFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_WEB_FIREBASE_APP_ID || defaultWebFirebaseConfig.appId,
  measurementId: import.meta.env.VITE_WEB_FIREBASE_MEASUREMENT_ID || defaultWebFirebaseConfig.measurementId,
}

const hasWebFirebase = Boolean(webFirebaseConfig.apiKey && webFirebaseConfig.projectId && webFirebaseConfig.appId)
const firebaseConfig = webFirebaseConfig

const app = getApps().find(item => item.name === "talib-web")
  || initializeApp(firebaseConfig, "talib-web")

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const isUsingFallbackFirebase = !hasWebFirebase
