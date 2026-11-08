const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

function roomInfo(room) {
  return { room, viewers: [...room.viewers].map(id => ({ id, name: room.names.get(id) || "Espectador" })) };
}
function emitRoomUpdate(code) {
  const room = rooms.get(code);
  if (room) io.to(room.host).emit("room-update", roomInfo(room));
}
io.on("connection", socket => {
  socket.on("host-register", ({ code, password }) => {
    if (!code || rooms.has(code)) return socket.emit("room-error", "Esse código já está em uso. Escolha outro.");
    rooms.set(code, { host: socket.id, password: password || "", viewers: new Set(), names: new Map() });
    socket.data.hostRoom = code;
    socket.join(code);
    socket.emit("host-ready", { room: code });
  });

  socket.on("viewer-join", ({ code, password, name }) => {
    const room = rooms.get(code);
    if (!room) return socket.emit("room-error", "Sala não encontrada ou transmissão encerrada.");
    if (room.password !== (password || "")) return socket.emit("room-error", "Senha incorreta.");
    socket.join(code);
    room.viewers.add(socket.id);
    room.names.set(socket.id, (name || "Espectador").slice(0, 24));
    socket.data.viewerRoom = code;
    socket.emit("room-waiting");
    io.to(room.host).emit("viewer-joined", { viewerId: socket.id });
    emitRoomUpdate(code);
  });

  socket.on("signal", ({ target, data }) => {
    if (target && data) io.to(target).emit("signal", { from: socket.id, data });
  });

  socket.on("chat-message", ({ code, message }) => {
    const room = rooms.get(code);
    if (!room || (socket.id !== room.host && !room.viewers.has(socket.id))) return;
    const author = socket.id === room.host ? "100Key Host" : (room.names.get(socket.id) || "Espectador");
    io.to(code).emit("chat-message", { author, message: String(message || "").slice(0, 400), mine: socket.id });
  });

  socket.on("host-kick", ({ code, viewerId }) => {
    const room = rooms.get(code);
    if (!room || room.host !== socket.id || !room.viewers.has(viewerId)) return;
    io.to(viewerId).emit("kicked");
    io.sockets.sockets.get(viewerId)?.leave(code);
    room.viewers.delete(viewerId);
    room.names.delete(viewerId);
    emitRoomUpdate(code);
  });

  socket.on("disconnect", () => {
    const code = socket.data.hostRoom;
    if (code && rooms.get(code)?.host === socket.id) {
      io.to(code).emit("host-left");
      rooms.delete(code);
    }
    const viewerCode = socket.data.viewerRoom;
    const room = rooms.get(viewerCode);
    if (room) { room.viewers.delete(socket.id); room.names.delete(socket.id); emitRoomUpdate(viewerCode); }
  });
});

server.listen(PORT, () => console.log(`100Key Stream rodando em http://localhost:${PORT}`));