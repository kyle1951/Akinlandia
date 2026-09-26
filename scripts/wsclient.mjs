const code = process.argv[2];
const token = process.argv[3] ?? 'friend-token-abcdef123';
const ws = new WebSocket(`ws://localhost:8787/api/rooms/${code}/ws?token=${token}`);
let n = 0;
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  n++;
  if (msg.type === 'state') {
    const v = msg.view;
    const hands = Object.fromEntries(Object.values(v.players).map((p) => [p.leaderName, p.hand]));
    console.log(JSON.stringify({ n, type: msg.type, viewerId: v.viewerId, waitingOn: v.waitingOn, pending: v.pending?.kind ?? null, deck: v.deck.slice(0, 3), rng: v.rng, tasks: v.tasks.length, actionLog: v.actionLog.length, cards: Object.keys(v.cards).length, hands, mySeat: msg.lobby.mySeat, online: msg.lobby.playersOnline, turn: v.turn, phase: v.phase }));
  } else console.log(JSON.stringify({ n, ...msg }).slice(0, 300));
  if (n >= 2) { ws.close(); process.exit(0); }
};
ws.onerror = (e) => { console.error('error', e.message); process.exit(1); };
setTimeout(() => { console.log('timeout after', n, 'messages'); process.exit(0); }, 8000);
