# Family Games

Phone-friendly family games and shared scorecards. Join with a short code — no accounts.

**Live site (GitHub Pages):** after the first merge to `main` and Pages is enabled, visit  
`https://dralorex.github.io/Family-Games/`

## What’s included

### Home
- **Games** — digital multiplayer on phones  
- **Scorecards** — live scoring for table games  

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

**Host on a new browser:** use Home → Continue as host (or join with the same creator name + code). The lobby for that name opens on this browser, host authority moves over, and phones still connected re-sync from the retained room state.
