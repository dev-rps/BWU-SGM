import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { doc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../firebase/firebase";

// Signup
export const signup = async (name, email, password) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(doc(db, "users", result.user.uid), {
    uid: result.user.uid,
    name,
    email,
    createdAt: new Date(),
  });

  return result.user;
};

// Login
export const login = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

// Google Login
export const googleLogin = () =>
  signInWithPopup(auth, googleProvider);

// Logout
export const logout = () =>
  signOut(auth);