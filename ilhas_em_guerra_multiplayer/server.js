const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    status: room.status,
    players: room.players.map(p => ({ id: p.id, name: p.name }))
  };
}
function emitRoom(room) { io.to(room.code).emit("roomUpdate", publicRoom(room)); }
function cleanName(value) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, 16);
}
function removePlayer(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(code);
  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
    if (room.status === "playing") room.status = "lobby";
    io.to(code).emit("roomClosed");
    // Room remains open and a new host is assigned.
  }
  emitRoom(room);
}
io.on("connection", socket => {
  socket.on("createRoom", ({ name, maxPlayers } = {}) => {
    removePlayer(socket);
    const playerName = cleanName(name);
    if (!playerName) return socket.emit("roomError", "Digite um nome válido.");
    const limit = Number(maxPlayers) === 2 ? 2 : 3;
    const code = makeCode();
    const room = {
      code, hostId: socket.id, maxPlayers: limit, status: "lobby",
      players: [{ id: socket.id, name: playerName }]
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("roomCreated", publicRoom(room));
  });

  socket.on("joinRoom", ({ code, name } = {}) => {
    removePlayer(socket);
    const playerName = cleanName(name);
    const roomCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!playerName) return socket.emit("roomError", "Digite um nome válido.");
    if (!room) return socket.emit("roomError", "Sala não encontrada. Confira o código.");
    if (room.status !== "lobby") return socket.emit("roomError", "Essa partida já começou.");
    if (room.players.length >= room.maxPlayers) return socket.emit("roomError", "Essa sala está cheia.");
    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.emit("joinedRoom", publicRoom(room));
    emitRoom(room);
  });

  socket.on("startGame", ({ code } = {}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room || room.hostId !== socket.id) return socket.emit("roomError", "Somente o anfitrião pode iniciar.");
    if (room.players.length < 2) return socket.emit("roomError", "É necessário pelo menos 2 jogadores.");
    room.status = "playing";
    io.to(room.code).emit("gameStarting", publicRoom(room));
  });

  socket.on("leaveRoom", () => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    removePlayer(socket);
    if (room && rooms.has(code)) emitRoom(room);
  });
  socket.on("disconnect", () => removePlayer(socket));
});

server.listen(PORT, () => console.log(`Ilhas em Guerra rodando na porta ${PORT}`));
