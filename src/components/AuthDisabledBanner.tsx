import { authSetupHints, isAuthBackendConfigured } from '../auth/config'

export function AuthDisabledBanner({ compact = false }: { compact?: boolean }) {
  if (isAuthBackendConfigured()) {
    return (
      <div className="auth-banner auth-banner-live">
        <strong>Accounts backend detected.</strong> Confirm Cloud Functions + email sending before
        inviting players to register.
      </div>
    )
  }

  return (
    <div className="auth-banner auth-banner-blocked" role="status">
      <strong>Do not use accounts yet.</strong>
      <p>
        Sign-up / sign-in UI is scaffolded only. Wait until you add Firebase (or another auth DB),
        env secrets, and the email-code functions described in the setup hints.
      </p>
      {!compact ? (
        <ul className="auth-hints">
          {authSetupHints().map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">See README → Accounts setup for the full checklist.</p>
      )}
    </div>
  )
}
