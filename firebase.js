import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCjC2FETl-H_Cq07Ql8Cx2h8KYOh9T-GjM",
  authDomain: "landvms.firebaseapp.com",
  projectId: "landvms",
  storageBucket: "landvms.firebasestorage.app",
  messagingSenderId: "750813754088",
  appId: "1:750813754088:web:016b3f063f9a5d98df8f5d",
  measurementId: "G-PHR8DJEBFG"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
