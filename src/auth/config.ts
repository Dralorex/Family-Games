export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
  /** Realtime / Firestore database URL if used for profiles */
  databaseURL?: string
}

/** True only when all required Vite env vars are present. */
export function isAuthBackendConfigured(): boolean {
  const c = readFirebaseConfig()
  return Boolean(c?.apiKey && c.authDomain && c.projectId && c.appId)
}

export function readFirebaseConfig(): FirebaseWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
  if (!apiKey || !authDomain || !projectId || !appId) return null
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  }
}

/** Cloud Functions / callable endpoints for codes + username lookup */
export function readAuthFunctionsBase(): string | null {
  const base = import.meta.env.VITE_AUTH_FUNCTIONS_URL as string | undefined
  return base?.replace(/\/$/, '') || null
}

export function authSetupHints(): string[] {
  return [
    'Create a Firebase project and enable Authentication + Firestore (or RTDB).',
    'Copy web app config into a `.env` / GitHub Actions secrets as VITE_FIREBASE_*.',
    'Deploy Cloud Functions for: username lookup, 6-digit email codes, server-side lockouts.',
    'Set VITE_AUTH_FUNCTIONS_URL to your functions base URL.',
    'Add an email provider (e.g. SendGrid / SES / Firebase Extensions) for verification codes.',
    'Do not enable accounts for players until those pieces are live — this UI is a scaffold only.',
  ]
}
