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

test("organizer can create and read quiz", async () => {
  const api = serverCtx.request;
  const { token } = await registerUser(api, "org1@example.com", "organizer");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Sample Quiz",
      categories: ["general"],
      questions: [
        {
          type: "text",
          prompt: "2+2?",
          options: ["3", "4"],
          correctAnswers: ["4"],
          timeLimit: 15
        }
      ]
    });

  expect(createRes.status).toBe(200);
  expect(createRes.body.id).toBeTruthy();

  const listRes = await api
    .get("/quizzes")
    .set("Authorization", `Bearer ${token}`);
  expect(listRes.status).toBe(200);
  expect(listRes.body.quizzes.length).toBe(1);

  const getRes = await api
    .get(`/quizzes/${createRes.body.id}`)
    .set("Authorization", `Bearer ${token}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body.quiz.questions.length).toBe(1);
});

test("participant cannot manage quizzes", async () => {
  const api = serverCtx.request;
  const { token } = await registerUser(api, "user3@example.com", "participant");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Nope",
      categories: ["general"],
      questions: []
    });

  expect(createRes.status).toBe(403);
});

test("organizer can update and delete quiz", async () => {
  const api = serverCtx.request;
  const { token } = await registerUser(api, "org2@example.com", "organizer");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Old Title",
      categories: ["general"],
      questions: [
        {
          type: "text",
          prompt: "Q1",
          options: ["a", "b"],
          correctAnswers: ["a"],
          timeLimit: 10
        }
      ]
    });

  const quizId = createRes.body.id;
  const updateRes = await api
    .put(`/quizzes/${quizId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "New Title",
      categories: ["math"],
      questions: [
        {
          type: "text",
          prompt: "Q2",
          options: ["1", "2"],
          correctAnswers: ["2"],
          timeLimit: 12
        }
      ]
    });
  expect(updateRes.status).toBe(200);

  const getRes = await api
    .get(`/quizzes/${quizId}`)
    .set("Authorization", `Bearer ${token}`);
  expect(getRes.status).toBe(200);
  expect(getRes.body.quiz.title).toBe("New Title");
  expect(getRes.body.quiz.categories[0]).toBe("math");
  expect(getRes.body.quiz.questions[0].prompt).toBe("Q2");

  const deleteRes = await api
    .delete(`/quizzes/${quizId}`)
    .set("Authorization", `Bearer ${token}`);
  expect(deleteRes.status).toBe(200);

  const missingRes = await api
    .get(`/quizzes/${quizId}`)
    .set("Authorization", `Bearer ${token}`);
  expect(missingRes.status).toBe(404);
});

test("organizer cannot access others quizzes", async () => {
  const api = serverCtx.request;
  const { token: tokenA } = await registerUser(api, "orgA@example.com", "organizer");
  const { token: tokenB } = await registerUser(api, "orgB@example.com", "organizer");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${tokenA}`)
    .send({
      title: "Private Quiz",
      categories: ["general"],
      questions: []
    });

  const getRes = await api
    .get(`/quizzes/${createRes.body.id}`)
    .set("Authorization", `Bearer ${tokenB}`);
  expect(getRes.status).toBe(404);
});
