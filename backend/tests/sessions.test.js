const { resetDb, startTestServer, stopTestServer, registerUser } = require("./testUtils");

beforeAll(() => {
  process.env.DB_FILE = ":memory:";
  process.env.JWT_SECRET = "test_secret";
});

let serverCtx;

beforeEach(async () => {
  serverCtx = await startTestServer();
  resetDb();
});

afterEach(async () => {
  await stopTestServer(serverCtx.server, serverCtx.io);
});

test("organizer can start session and fetch it by code", async () => {
  const api = serverCtx.request;
  const { token } = await registerUser(api, "org3@example.com", "organizer");

  const quizRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Session Quiz",
      categories: ["general"],
      questions: []
    });

  const startRes = await api
    .post(`/quizzes/${quizRes.body.id}/start`)
    .set("Authorization", `Bearer ${token}`);
  expect(startRes.status).toBe(200);
  expect(startRes.body.roomCode).toBeTruthy();

  const sessionRes = await api
    .get(`/sessions/${startRes.body.roomCode}`)
    .set("Authorization", `Bearer ${token}`);
  expect(sessionRes.status).toBe(200);
  expect(sessionRes.body.session.roomCode).toBe(startRes.body.roomCode);
});

test("participant cannot start session", async () => {
  const api = serverCtx.request;
  const { token: organizerToken } = await registerUser(api, "org4@example.com", "organizer");
  const { token: participantToken } = await registerUser(api, "user4@example.com", "participant");

  const quizRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      title: "Locked Quiz",
      categories: ["general"],
      questions: []
    });

  const startRes = await api
    .post(`/quizzes/${quizRes.body.id}/start`)
    .set("Authorization", `Bearer ${participantToken}`);
  expect(startRes.status).toBe(403);
});

test("getting unknown session returns 404", async () => {
  const api = serverCtx.request;
  const { token } = await registerUser(api, "org5@example.com", "organizer");

  const res = await api
    .get("/sessions/NOPE12")
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(404);
});
