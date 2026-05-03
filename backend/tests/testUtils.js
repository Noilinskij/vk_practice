const http = require("http");
const request = require("supertest");
const { Server } = require("socket.io");
const { io: Client } = require("socket.io-client");
const { createApp } = require("../src/app");
const { attachSocket } = require("../src/socket");
const { db } = require("../src/db");

function resetDb() {
  db.exec(
    "DELETE FROM answers;" +
      "DELETE FROM session_participants;" +
      "DELETE FROM sessions;" +
      "DELETE FROM questions;" +
      "DELETE FROM quizzes;" +
      "DELETE FROM users;"
  );
}

function startTestServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  attachSocket(io);

  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({
        app,
        server,
        io,
        url: `http://127.0.0.1:${port}`,
        request: request(app)
      });
    });
  });
}

function stopTestServer(server, io) {
  return new Promise((resolve) => {
    io.close(() => {
      server.close(() => resolve());
    });
  });
}

function connectSocket(url, token) {
  return Client(url, {
    transports: ["websocket"],
    auth: { token },
    reconnection: false,
    forceNew: true
  });
}

async function registerUser(api, email, role) {
  const password = "password123";
  const res = await api.post("/auth/register").send({ email, password, role });
  return { user: res.body.user, token: res.body.token, password };
}

module.exports = {
  resetDb,
  startTestServer,
  stopTestServer,
  connectSocket,
  registerUser
};
