import { Link } from 'react-router-dom'

export function Home() {
  return (
    <main className="home">
      <div className="home-atmosphere" aria-hidden />
      <div className="home-content">
        <p className="brand">Family Games</p>
        <h1 className="home-headline">Play together from every phone.</h1>
        <p className="home-support">
          Join with a short code — digital games or shared scorecards for the table.
        </p>
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
