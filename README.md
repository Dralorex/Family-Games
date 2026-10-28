# Family Games

Phone-friendly family games and shared scorecards. Join with a short code.

**Live site (GitHub Pages):** after Pages is enabled, visit  
`https://dralorex.github.io/Family-Games/`

## Accounts (scaffold — do not use yet)

There is an **Account** page with sign-up / sign-in / email-code UI, but **accounts must stay off until you add the backend**.

Without Firebase (and Cloud Functions for email codes), registration is blocked on purpose. Do not tell players to create accounts until the checklist below is done.

### Planned behavior (once configured)
- Username + password; **email optional**
- Clear warning: no email ⇒ forgotten password is **never recoverable**
- Sign in with **username or email**
- Email verification via **random 6-digit codes** (server-generated only)
- After **3** failed password attempts or code attempts: lock **1 min → 5 → 10 → 30 → 60 → …**

### Setup checklist
1. Create a Firebase project; enable **Authentication** (Email/Password) and **Firestore**
2. Add a web app; copy config into `.env.local` from `.env.example` (`VITE_FIREBASE_*`)
3. Deploy Firestore rules so only the owner can read/write their `profiles/{uid}` and usernames are unique
4. Deploy Cloud Functions:
   - `sendEmailCode` — mint a random 6-digit code, store hash + expiry server-side, send email
   - `verifyEmailCode` — check code, enforce the 3-strike lockout schedule server-side too
5. Set `VITE_AUTH_FUNCTIONS_URL` to the functions base URL
6. Wire an email provider (SendGrid, SES, etc.)
7. Add the same `VITE_*` values as GitHub Actions secrets for Pages builds
8. Only then remove/relax the “do not use yet” messaging

Client lockout helpers exist for UX, but **real lockouts must also run on the server** or they can be bypassed.

## What’s included

### Home
- **Games** — digital multiplayer on phones  
- **Scorecards** — live scoring for table games  
- **Account** — scaffold only until Firebase/Functions are live  


### Games
- **Hot Potato** — host sets a min–max fuse range; it ends randomly in that window; every phone plays a synced alarm; holder taps Explode; placement board for up to 50 players  

### Scorecards
| Game | Win | Ends |
| --- | --- | --- |
| Play 9 | Lowest | After 9 rounds → top 3 |
| Uno Golf | Lowest | After 9 rounds → top 3 |
| Five Crowns | Lowest | After 11 rounds → top 3 |
| Tapped 4 | Lowest | Total ≥ limit (default 150) → top 3 |
| Flip 7 | Highest | Total ≥ limit (default 200) → top 3 |

Game master advances rounds (button stays red until everyone has entered a score, then green). Totals/place show from round 2 onward.

## Local development

```bash
npm install
npm run dev
```

## Deploy

GitHub Actions deploys `main` to GitHub Pages. Enable **Settings → Pages → Source: GitHub Actions** on the repo if needed.

## Sync note

Rooms sync live over MQTT (public HiveMQ broker) so the static Pages site can still do multiplayer without a custom backend. Fine for family use; don’t put secrets in room state.
