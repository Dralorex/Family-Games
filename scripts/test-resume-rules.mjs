/** Lightweight checks for resume offer rules (no MQTT). */
function shouldOfferResume(room) {
  if (!room) return false
  if (room.status === 'closed') return false
  if (room.status === 'finished' && !Object.values(room.players).some((p) => !p.left)) return false
  return true
}

const cases = [
  {
    name: 'playing offers continue',
    room: { status: 'playing', players: { a: { left: false } } },
    expect: true,
  },
  {
    name: 'closed never offers',
    room: { status: 'closed', players: { a: { left: false } } },
    expect: false,
  },
  {
    name: 'finished empty lobby no offer',
    room: { status: 'finished', players: { a: { left: true }, b: { left: true } } },
    expect: false,
  },
  {
    name: 'finished with people still offers',
    room: { status: 'finished', players: { a: { left: false } } },
    expect: true,
  },
  { name: 'missing room no offer', room: null, expect: false },
]

let failed = 0
for (const c of cases) {
  const got = shouldOfferResume(c.room)
  if (got !== c.expect) {
    console.error('FAIL', c.name, 'got', got, 'expected', c.expect)
    failed += 1
  } else {
    console.log('ok', c.name)
  }
}
if (failed) process.exit(1)
console.log('OK resume rules')
