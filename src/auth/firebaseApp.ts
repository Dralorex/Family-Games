import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { isAuthBackendConfigured, readFirebaseConfig } from './config'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

export function getFirebaseApp(): FirebaseApp | null {
  if (!isAuthBackendConfigured()) return null
  if (app) return app
  const config = readFirebaseConfig()
  if (!config) return null
  app = initializeApp(config)
  return app
}

export function getFirebaseAuth(): Auth | null {
  const a = getFirebaseApp()
  if (!a) return null
  if (!auth) auth = getAuth(a)
  return auth
}

export function getFirebaseDb(): Firestore | null {
  const a = getFirebaseApp()
  if (!a) return null
  if (!db) db = getFirestore(a)
  return db
}
