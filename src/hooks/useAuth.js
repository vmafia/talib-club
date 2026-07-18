import { useEffect, useMemo, useState } from "react"
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  browserLocalPersistence,
  EmailAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithRedirect,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth"
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { auth, db } from "../lib/firebase.js"

const DEFAULT_PROFILE = { role: "member", displayName: "", email: "" }
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: "select_account" })

const POPUP_FALLBACK_CODES = new Set([
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
])

const withTimeout = (promise, ms = 5000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
  ])
}

async function saveGoogleProfile(firebaseUser) {
  const ref = doc(db, "users", firebaseUser.uid)
  const snap = await withTimeout(getDoc(ref))
  const payload = {
    role: snap.exists() ? snap.data()?.role || "member" : "member",
    displayName: firebaseUser.displayName || "",
    email: firebaseUser.email || "",
    photoURL: firebaseUser.photoURL || "",
    provider: "google",
    updatedAt: serverTimestamp(),
  }

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp()
  }

  await setDoc(ref, payload, { merge: true })
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence)
      .catch(err => console.error("Cannot set auth persistence", err))

    getRedirectResult(auth)
      .then(res => {
        if (res?.user) return saveGoogleProfile(res.user)
        return null
      })
      .catch(err => console.error("Cannot finish Google redirect", err))

    let activeSeq = 0
    
    // Fallback timeout in case Firebase Auth is completely blocked by AdBlocker
    const initTimeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn("Firebase Auth initialization timed out (possibly blocked by extensions).")
          return false
        }
        return prev
      })
    }, 6000)

    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      clearTimeout(initTimeout)
      const currentSeq = ++activeSeq
      setUser(currentUser)
      if (!currentUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const ref = doc(db, "users", currentUser.uid)
        
        const cacheKey = `talib_user_profile_${currentUser.uid}`;
        let snapData = null;
        let exists = false;
        
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
              snapData = parsed.data;
              exists = true;
              // BUG-03 fix: Background refresh to catch role changes
              getDoc(ref).then(snap => {
                if (currentSeq !== activeSeq || !snap.exists()) return
                const freshData = snap.data()
                if (freshData.role !== snapData.role) {
                  try { localStorage.setItem(cacheKey, JSON.stringify({ data: freshData, timestamp: Date.now() })) } catch(e) {}
                  setProfile(prev => ({ ...DEFAULT_PROFILE, ...(prev || {}), ...freshData }))
                }
              }).catch(() => {})
            }
          }
        } catch(e) {}

        if (!exists) {
          const snap = await withTimeout(getDoc(ref))
          if (currentSeq !== activeSeq) return
          if (snap.exists()) {
            snapData = snap.data()
            exists = true;
            try { localStorage.setItem(cacheKey, JSON.stringify({ data: snapData, timestamp: Date.now() })) } catch(e) {}
          }
        } else {
          if (currentSeq !== activeSeq) return
        }

        if (exists) {
          // Only update if auth data actually changed, not every render
          const email = currentUser.email || ""
          const displayName = currentUser.displayName || snapData.displayName || ""
          const photoURL = currentUser.photoURL || snapData.photoURL || ""

          const hasChanged =
            (snapData.email || "") !== email ||
            (snapData.displayName || "") !== displayName ||
            (snapData.photoURL || "") !== photoURL

          if (hasChanged) {
            // Only write if data truly changed and auth state hasn't changed
            if (currentSeq !== activeSeq) return
            const newData = { email, displayName, photoURL, updatedAt: serverTimestamp() };
            await setDoc(ref, newData, { merge: true }).catch(e => console.error("Sync profile to firestore failed", e))
            // Update cache
            try { localStorage.setItem(cacheKey, JSON.stringify({ data: { ...snapData, email, displayName, photoURL }, timestamp: Date.now() })) } catch(e) {}
          }
          if (currentSeq !== activeSeq) return
          setProfile({
            ...DEFAULT_PROFILE,
            ...snapData,
            email,
            displayName,
            photoURL,
          })
        } else {
          const nextProfile = {
            role: "member",
            displayName: currentUser.displayName || "",
            email: currentUser.email || "",
            createdAt: serverTimestamp(),
          }
          if (currentSeq !== activeSeq) return
          await setDoc(ref, nextProfile)
          if (currentSeq !== activeSeq) return
          try { localStorage.setItem(cacheKey, JSON.stringify({ data: nextProfile, timestamp: Date.now() })) } catch(e) {}
          setProfile({ ...nextProfile, createdAt: new Date() })
        }
      } catch (err) {
        console.error("Cannot load user profile", err)
        if (currentSeq !== activeSeq) return
        setProfile({ ...DEFAULT_PROFILE, email: currentUser.email || "" })
      } finally {
        if (currentSeq === activeSeq) {
          setLoading(false)
        }
      }
    })
    
    return () => {
      clearTimeout(initTimeout)
      unsubscribe()
    }
  }, [])

  // BUG-09 fix: Separate stable action functions from reactive values
  // These functions only depend on the `auth` singleton and `setProfile`, not on user/profile/loading
  const actions = useMemo(() => ({
    async login(email, password) {
      return signInWithEmailAndPassword(auth, email, password)
    },
    async loginWithGoogle() {
      try {
        const res = await signInWithPopup(auth, googleProvider)
        await saveGoogleProfile(res.user)
        return res
      } catch (err) {
        if (!POPUP_FALLBACK_CODES.has(err.code)) throw err
        window.sessionStorage.setItem("talibAfterLogin", "member")
        await signInWithRedirect(auth, googleProvider)
        return { redirecting: true }
      }
    },
    async register({ email, password, displayName }) {
      const cleanEmail = email.trim().toLowerCase()
      const cleanDisplayName = displayName ? displayName.trim() : ""
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, password)
      if (cleanDisplayName) await updateProfile(res.user, { displayName: cleanDisplayName })
      await setDoc(doc(db, "users", res.user.uid), {
        role: "member",
        displayName: cleanDisplayName,
        email: cleanEmail,
        emailVerified: res.user.emailVerified,
        createdAt: serverTimestamp(),
      })
      await sendEmailVerification(res.user)
      return res
    },
    async updateUserProfile({ displayName }) {
      if (!auth.currentUser) throw new Error("Missing current user")
      const cleanDisplayName = (displayName || "").trim()
      await updateProfile(auth.currentUser, { displayName: cleanDisplayName })
      const nextProfile = {
        displayName: cleanDisplayName,
        email: auth.currentUser.email || "",
        updatedAt: serverTimestamp(),
      }
      await setDoc(doc(db, "users", auth.currentUser.uid), nextProfile, { merge: true })
      // H2: Invalidate localStorage cache so the updated profile is fetched fresh
      try { localStorage.removeItem(`talib_user_profile_${auth.currentUser.uid}`) } catch(e) {}
      setProfile(prev => ({ ...DEFAULT_PROFILE, ...(prev || {}), ...nextProfile }))
    },
    async updateUserPassword(newPassword) {
      if (!auth.currentUser) throw new Error("Missing current user")
      const cleanPassword = newPassword.trim()
      if (!cleanPassword) throw new Error("Missing password")
      await updatePassword(auth.currentUser, cleanPassword)
    },
    async requestEmailChange(nextEmail) {
      if (!auth.currentUser) throw new Error("Missing current user")
      const cleanEmail = (nextEmail || "").trim().toLowerCase()
      if (!cleanEmail) throw new Error("Missing email")
      if (cleanEmail === auth.currentUser.email) throw new Error("Email is unchanged")
      await verifyBeforeUpdateEmail(auth.currentUser, cleanEmail)
    },
    async reauthenticateForSensitiveAction(password = "") {
      if (!auth.currentUser?.email) throw new Error("Missing current user")
      const providers = auth.currentUser.providerData.map(item => item.providerId)
      if (providers.includes(GoogleAuthProvider.PROVIDER_ID) && !providers.includes("password")) {
        return reauthenticateWithPopup(auth.currentUser, googleProvider)
      }

      const cleanPassword = password.trim()
      if (!cleanPassword) throw new Error("Missing password")
      const credential = EmailAuthProvider.credential(auth.currentUser.email, cleanPassword)
      return reauthenticateWithCredential(auth.currentUser, credential)
    },
    async sendCurrentEmailVerification() {
      if (!auth.currentUser) throw new Error("Missing current user")
      await sendEmailVerification(auth.currentUser)
    },
    async sendPasswordReset() {
      if (!auth.currentUser?.email) throw new Error("Missing current user email")
      await sendPasswordResetEmail(auth, auth.currentUser.email)
    },
    async sendPasswordResetForEmail(email) {
      const cleanEmail = (email || "").trim().toLowerCase()
      if (!cleanEmail) throw new Error("Missing email")
      await sendPasswordResetEmail(auth, cleanEmail)
    },
    logout() {
      return signOut(auth)
    },
  }), [])

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    isStaff: profile?.role === "staff" || profile?.role === "admin" || profile?.role === "owner",
    ...actions,
  }), [user, profile, loading, actions])

  return value
}