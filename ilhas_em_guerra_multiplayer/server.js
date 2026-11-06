const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const rooms = new Map();
app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const COLORS = ['#55c6e8', '#ef8b68', '#a78bfa'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function cleanName(value) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, 16); }
function newPlayer(id, name, index) {
  return { id, name, color: COLORS[index], hp: 100, maxHp: 100, soldiers: 6, dollars: 10, pink: 0,
    orchards: 0, boughtOrchards: false, fort: false, bombs: 0, submarine: false, submarineLevel: 0, commander: false,
    damageDone: 0, damageByTarget: {}, defeatedSoldiers: 0, challenge: null, submarineTarget: null, ready: false, action: null, answer: null, eliminated: false };
}
function publicPlayer(p, viewerId) {
  return { id: p.id, name: p.name, color: p.color, hp: p.hp, maxHp: p.maxHp, soldiers: p.soldiers,
    dollars: p.dollars, pink: p.pink, orchards: p.orchards, fort: p.fort, bombs: p.bombs,
    submarine: p.submarine, submarineLevel: p.submarineLevel, submarineTarget: p.submarineTarget, commander: p.commander, boughtOrchards: !!p.boughtOrchards,
    damageDone: p.damageDone, ready: p.ready, eliminated: p.eliminated,
    challenge: p.challenge ? { question: p.challenge.question } : null,
    action: p.id === viewerId ? p.action : null };
}
function publicRoom(room, viewerId) {
  return { code: room.code, status: room.status, phase: room.phase, round: room.round,
    hostId: room.hostId, maxPlayers: room.maxPlayers, players: room.players.map(p => publicPlayer(p, viewerId)),
    log: room.log.slice(-8), winnerId: room.winnerId || null };
}
function sendState(room) { room.players.forEach(p => io.to(p.id).emit('gameState', publicRoom(room, p.id))); }
function log(room, message) { room.log.push(message); if (room.log.length > 30) room.log.shift(); }
function roomFor(socket) { return rooms.get(socket.data.roomCode); }
function activePlayers(room) { return room.players.filter(p => !p.eliminated); }
function findPlayer(room, id) { return room.players.find(p => p.id === id); }
function removePlayer(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  socket.data.roomCode = null;
  const room = rooms.get(code);
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(code);
  if (!room.players.length) { rooms.delete(code); return; }
  if (room.hostId === socket.id) room.hostId = room.players[0].id;
  if (room.status === 'playing' && activePlayers(room).length < 2) finishGame(room, activePlayers(room)[0]?.id || null);
  sendState(room);
}
function randomChallenge() {
  const kind = crypto.randomInt(3);
  if (kind === 0) { const a = crypto.randomInt(3, 13), b = crypto.randomInt(2, 10), x = crypto.randomInt(2, 8); return { question: `Resolva: ${a}x + ${b} = ${a * x + b}`, answer: x }; }
  if (kind === 1) { const a = crypto.randomInt(3, 13), b = crypto.randomInt(2, 9); return { question: `Regra de três: se ${a} unidades custam ${b * 5}, quanto custam ${a * 2}?`, answer: b * 10 }; }
  const w = crypto.randomInt(3, 13), h = crypto.randomInt(3, 13); return { question: `Qual é a área de um retângulo de ${w} cm por ${h} cm?`, answer: w * h };
}
function startGame(room) {
  room.status = 'playing'; room.phase = 'shop'; room.round = 0;
  room.players.forEach(p => { p.ready = false; p.hp = 100; p.maxHp = 100; p.soldiers = 6; p.dollars = 10; p.pink = 0; p.orchards = 0; p.boughtOrchards = false; p.fort = false; p.bombs = 0; p.submarine = false; p.submarineLevel = 0; p.commander = false; p.damageDone = 0; p.damageByTarget = {}; p.defeatedSoldiers = 0; p.eliminated = false; p.challenge = null; p.submarineTarget = null; p.action = null; });
  log(room, 'A partida começou! Cada ilha inicia com 100 de vida, 6 soldados e $10.');
  sendState(room);
}
function applyDamage(room, target, amount, label) {
  if (!target || target.eliminated || amount <= 0) return 0;
  let damage = Math.max(0, Math.floor(amount));
  const absorbed = Math.min(damage, target.orchards * 5);
  damage -= absorbed;
  target.hp = Math.max(0, target.hp - damage);
  log(room, `${label}: ${target.name} recebeu ${damage} de dano${absorbed ? ` (${absorbed} bloqueados pelos pomares)` : ''}.`);
  return damage;
}
function finishGame(room, winnerId) {
  room.status = 'finished'; room.phase = 'finished'; room.winnerId = winnerId;
  const winner = findPlayer(room, winnerId);
  if (winner) log(room, `${winner.name} venceu a partida!`);
  else log(room, 'A partida terminou sem vencedor.');
  sendState(room);
}
function resolveRound(room) {
  const players = activePlayers(room);
  const attacks = players.filter(p => p.action?.type === 'attack' && p.action.success && p.action.targetId);
  const preSoldiers = new Map(players.map(p => [p.id, p.soldiers]));
  // All declared attacks deal damage using the troop count before any clash.
  for (const p of attacks) {
    const target = findPlayer(room, p.action.targetId);
    if (!target || target.eliminated) continue;
    const base = preSoldiers.get(p.id) * 2 + (p.fort ? 4 : 0);
    const dealt = applyDamage(room, target, base, `${p.name} atacou`);
    p.damageDone += dealt;
    p.damageByTarget[target.id] = (p.damageByTarget[target.id] || 0) + dealt;
  }
  // Reciprocal attacks cause a troop clash after damage, as described in the rules.
  const handled = new Set();
  for (const p of attacks) {
    const target = findPlayer(room, p.action.targetId);
    if (!target || !attacks.some(q => q.id === target.id && q.action.targetId === p.id)) continue;
    const pair = [p.id, target.id].sort().join(':');
    if (handled.has(pair)) continue; handled.add(pair);
    const a = preSoldiers.get(p.id), b = preSoldiers.get(target.id);
    const lossA = Math.min(a, b), lossB = Math.min(a, b);
    p.soldiers = Math.max(0, p.soldiers - lossA);
    target.soldiers = Math.max(0, target.soldiers - lossB);
    const loser = a === b ? null : (a > b ? target : p);
    const winner = a === b ? null : (a > b ? p : target);
    if (loser) {
      const killed = Math.min(a, b);
      winner.dollars += Math.floor(killed / 2);
      winner.defeatedSoldiers += killed;
      log(room, `Confronto: ${winner.name} venceu; ${loser.name} perdeu suas tropas do confronto.`);
    } else log(room, `Confronto: as tropas de ${p.name} e ${target.name} se anularam.`);
  }
  // Submarines and commanders act independently of the chosen action.
  for (const p of players) {
    if (p.submarine && p.submarineTarget) {
      const target = findPlayer(room, p.submarineTarget);
      if (target && !target.eliminated && target.id !== p.id) { const dealt = applyDamage(room, target, 10 * (1 + p.submarineLevel), `Submarino de ${p.name}`); p.damageDone += dealt; p.damageByTarget[target.id] = (p.damageByTarget[target.id] || 0) + dealt; }
    }
    if (p.commander) for (const target of players) if (target.id !== p.id && !target.eliminated) { const dealt = applyDamage(room, target, 30, `Comandante de ${p.name}`); p.damageDone += dealt; p.damageByTarget[target.id] = (p.damageByTarget[target.id] || 0) + dealt; }
  }
  // Resolve exploration rewards and bombs after combat.
  for (const p of players) {
    if (p.action?.type === 'explore') {
      const roll = crypto.randomInt(1, 5);
      if (roll === 1) { p.orchards++; p.maxHp += 10; p.hp += 10; log(room, `${p.name} encontrou um Pomar! +10 de vida e proteção.`); }
      if (roll === 2) { p.bombs++; log(room, `${p.name} encontrou uma Bomba para usar no próximo turno.`); }
      if (roll === 3) { p.soldiers += 2; log(room, `${p.name} encontrou 2 Recrutas!`); }
      if (roll === 4) { p.pink++; log(room, `${p.name} encontrou uma Moeda Rosa!`); }
      p.lastRoll = roll;
    }
    if (p.action?.type === 'bomb' && p.action.targetId && p.bombs > 0) {
      const target = findPlayer(room, p.action.targetId);
      if (target && !target.eliminated) {
        p.bombs--;
        if (target.orchards > 0) { const destroyed = Math.min(2, target.orchards); target.orchards -= destroyed; target.maxHp = Math.max(100, target.maxHp - destroyed * 10); target.hp = Math.min(target.hp, target.maxHp); log(room, `A bomba de ${p.name} destruiu ${destroyed} pomar(es) de ${target.name}, sem causar dano à ilha.`); }
        else { const dealt = applyDamage(room, target, 10, `Bomba de ${p.name}`); p.damageDone += dealt; p.damageByTarget[target.id] = (p.damageByTarget[target.id] || 0) + dealt; }
      }
    }
  }
  // Eliminate islands at zero health and award the highest damage dealer.
  const newlyOut = players.filter(p => !p.eliminated && p.hp <= 0);
  for (const out of newlyOut) {
    out.eliminated = true;
    const candidates = players.filter(p => p.id !== out.id);
    candidates.sort((a, b) => (b.damageByTarget[out.id] || 0) - (a.damageByTarget[out.id] || 0));
    if (candidates[0] && (candidates[0].damageByTarget[out.id] || 0) > 0) candidates[0].dollars += 3;
    log(room, `${out.name} perdeu sua ilha!`);
  }
  if (activePlayers(room).length <= 1) { finishGame(room, activePlayers(room)[0]?.id || null); return; }
  room.round++;
  room.phase = 'shop';
  for (const p of activePlayers(room)) { p.dollars += 2; p.ready = false; p.action = null; p.answer = null; p.challenge = null; p.lastRoll = null; }
  log(room, `Turno sem ação ${room.round}: cada jogador recebeu $2 para compras.`);
  sendState(room);
}
function maybeResolve(room) {
  const players = activePlayers(room);
  if (players.every(p => p.action && (p.action.type !== 'attack' || p.action.answered))) resolveRound(room);
  else sendState(room);
}
io.on('connection', socket => {
  socket.on('createRoom', ({ name, maxPlayers } = {}) => {
    removePlayer(socket); const playerName = cleanName(name);
    if (!playerName) return socket.emit('roomError', 'Digite um nome válido.');
    const limit = Number(maxPlayers) === 2 ? 2 : 3, code = makeCode();
    const room = { code, hostId: socket.id, maxPlayers: limit, status: 'lobby', phase: 'lobby', round: 0,
      players: [newPlayer(socket.id, playerName, 0)], log: [], winnerId: null };
    rooms.set(code, room); socket.join(code); socket.data.roomCode = code;
    socket.emit('roomCreated', publicRoom(room, socket.id));
  });
  socket.on('joinRoom', ({ code, name } = {}) => {
    removePlayer(socket); const playerName = cleanName(name), roomCode = String(code || '').trim().toUpperCase(), room = rooms.get(roomCode);
    if (!playerName) return socket.emit('roomError', 'Digite um nome válido.');
    if (!room) return socket.emit('roomError', 'Sala não encontrada. Confira o código.');
    if (room.status !== 'lobby') return socket.emit('roomError', 'Essa partida já começou.');
    if (room.players.length >= room.maxPlayers) return socket.emit('roomError', 'Essa sala está cheia.');
    room.players.push(newPlayer(socket.id, playerName, room.players.length)); socket.join(roomCode); socket.data.roomCode = roomCode;
    socket.emit('joinedRoom', publicRoom(room, socket.id)); io.to(roomCode).emit('roomUpdate', publicRoom(room, socket.id));
  });
  socket.on('startGame', ({ code } = {}) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.hostId !== socket.id) return socket.emit('roomError', 'Somente o anfitrião pode iniciar.');
    if (room.players.length < 2) return socket.emit('roomError', 'É necessário pelo menos 2 jogadores.');
    startGame(room);
  });
  socket.on('buyItem', ({ item, targetId } = {}) => {
    const room = roomFor(socket); const p = room && findPlayer(room, socket.id);
    if (!p || room.phase !== 'shop' || p.ready || p.eliminated) return;
    const fail = msg => socket.emit('roomError', msg);
    if (item === 'heal') {
      if (p.dollars < 5) return fail('Você precisa de $5 para comprar um Curandeiro.');
      const count = p.dollars >= 10 ? 2 : 1; p.dollars -= count === 2 ? p.dollars : 5; p.hp = Math.min(p.maxHp, p.hp + 10 * count);
      log(room, `${p.name} comprou ${count} Curandeiro(s) e recuperou ${10 * count} de vida.`);
    } else if (item === 'fort') {
      if (p.fort) return fail('Você já possui um Forte.'); if (p.dollars < 6) return fail('Você precisa de $6 para comprar um Forte.');
      p.dollars -= 6; p.fort = true; log(room, `${p.name} construiu um Forte (+4 de dano).`);
    } else if (item === 'orchards') {
      if (p.pink < 2) return fail('Você precisa de 2 Moedas Rosas.'); if (p.boughtOrchards) return fail('A compra de 3 Pomares é única por partida.');
      p.pink -= 2; p.orchards += 3; p.maxHp += 30; p.hp += 30; p.boughtOrchards = true; log(room, `${p.name} comprou 3 Pomares (+30 de vida).`);
    } else if (item === 'submarine') {
      if (p.submarine) return fail('Você já possui um Submarino.'); if (p.pink < 3) return fail('Você precisa de 3 Moedas Rosas.');
      p.pink -= 3; p.submarine = true; log(room, `${p.name} comprou um Submarino.`);
    } else if (item === 'upgradeSub') {
      if (!p.submarine) return fail('Compre um Submarino primeiro.'); if (p.pink < 1) return fail('Você precisa de 1 Moeda Rosa.');
      p.pink--; p.submarineLevel++; log(room, `${p.name} aprimorou o Submarino (+10 de dano).`);
    } else if (item === 'commander') {
      if (p.commander) return fail('Você já possui um Comandante.'); if (p.pink < 5) return fail('Você precisa de 5 Moedas Rosas.'); if (p.soldiers < 6) return fail('Você precisa de 6 soldados para formar o Comandante.');
      p.pink -= 5; p.soldiers -= 6; p.commander = true; p.maxHp += 25; p.hp += 25; log(room, `${p.name} convocou o Comandante! +25 de vida.`);
    } else return fail('Compra desconhecida.');
    sendState(room);
  });
  socket.on('setChallenge', ({ question, answer } = {}) => {
    const room = roomFor(socket), p = room && findPlayer(room, socket.id);
    if (!p || room.phase !== 'shop' || p.ready) return;
    const q = String(question || '').trim().slice(0, 140), a = Number(answer);
    if (!q || !Number.isFinite(a)) return socket.emit('roomError', 'Informe uma questão e uma resposta numérica.');
    p.challenge = { question: q, answer: a }; log(room, `${p.name} preparou uma questão para seus atacantes.`); sendState(room);
  });
  socket.on('setSubmarineTarget', ({ targetId } = {}) => {
    const room = roomFor(socket), p = room && findPlayer(room, socket.id), target = room && findPlayer(room, targetId);
    if (!p || room.phase !== 'shop' || p.ready || !p.submarine || !target || target.id === p.id || target.eliminated) return;
    p.submarineTarget = target.id; sendState(room);
  });
  socket.on('shopReady', () => {
    const room = roomFor(socket), p = room && findPlayer(room, socket.id);
    if (!p || room.phase !== 'shop' || p.eliminated) return;
    p.ready = true;
    if (activePlayers(room).every(x => x.ready)) { room.phase = 'action'; activePlayers(room).forEach(x => { x.ready = false; }); log(room, `Turno de ação ${room.round + 1}: escolham atacar ou explorar.`); }
    sendState(room);
  });
  socket.on('chooseAction', ({ type, targetId } = {}) => {
    const room = roomFor(socket), p = room && findPlayer(room, socket.id);
    if (!p || room.phase !== 'action' || p.action || p.eliminated) return;
    const target = room.players.find(x => x.id === targetId && !x.eliminated && x.id !== p.id);
    if (type === 'attack') {
      if (!target) return socket.emit('roomError', 'Escolha um adversário válido.');
      const challenge = target.challenge || randomChallenge();
      p.action = { type: 'attack', targetId: target.id, success: false, answered: false, question: challenge.question, expected: challenge.answer };
      } else if (type === 'explore') p.action = { type: 'explore' };
    else if (type === 'bomb') {
      if (p.bombs < 1) return socket.emit('roomError', 'Você não tem bombas.');
      if (!target) return socket.emit('roomError', 'Escolha um adversário válido.');
      p.action = { type: 'bomb', targetId: target.id };
    } else return;
    maybeResolve(room);
    if (type === 'attack') socket.emit('mathChallenge', { question: p.action.question });
  });
  socket.on('answerChallenge', ({ answer } = {}) => {
    const room = roomFor(socket), p = room && findPlayer(room, socket.id), action = p?.action;
    if (!p || room.phase !== 'action' || !action || action.type !== 'attack' || action.answered) return;
    const value = Number(answer); const expected = action.expected;
    action.success = Number.isFinite(value) && value === expected; action.answered = true;
    log(room, action.success ? `${p.name} resolveu a questão e confirmou o ataque!` : `${p.name} errou a questão: o ataque falhou.`);
    maybeResolve(room);
  });
  socket.on('leaveRoom', () => removePlayer(socket));
  socket.on('disconnect', () => removePlayer(socket));
});
server.listen(PORT, () => console.log(`Ilhas em Guerra rodando na porta ${PORT}`));
