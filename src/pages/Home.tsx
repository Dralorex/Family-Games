import { Link } from 'react-router-dom'
import { PartyListener } from '../components/PartyListener'
import { getActiveParty } from '../lib/party'

export function Home() {
  const party = getActiveParty()
  return (
    <main className="home">
      <PartyListener />
      <div className="home-atmosphere" aria-hidden />
      <div className="home-content">
        <p className="brand">Family Games</p>
        <h1 className="home-headline">Play together from every phone.</h1>
        <p className="home-support">
          Join with a short code — digital games or shared scorecards for the table.
        </p>
        {party ? (
          <p className="home-support party-banner">
            Group still connected — pick a game and everyone can follow the host.
          </p>
        ) : null}
        <div className="home-actions">
          <Link className="btn primary large" to="/games">
            Games
          </Link>
          <Link className="btn secondary large" to="/scorecards">
            Scorecards
          </Link>
        </div>
      </div>
    </main>
  )
}
