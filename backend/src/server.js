require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const { createApp } = require("./app");
const { attachSocket } = require("./socket");

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*" }
});

attachSocket(io);

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});
