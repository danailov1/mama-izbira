import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: 'AIzaSyAEF5x0xWzpS70EsoMn48_N5m1B3ZPUh44',
  authDomain: 'mamaizbira.firebaseapp.com',
  projectId: 'mamaizbira',
  storageBucket: 'mamaizbira.firebasestorage.app',
  messagingSenderId: '524585738665',
  appId: '1:524585738665:web:394e0a90eda71628fd24b8',
}

let app: FirebaseApp
let auth: Auth
let db: Firestore

export function getApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig)
  return app
}

export function getAuthInstance(): Auth {
  if (!auth) auth = getAuth(getApp())
  return auth
}

export function getDb(): Firestore {
  if (!db) db = getFirestore(getApp())
  return db
}
