const {
  resetDb,
  startTestServer,
  stopTestServer,
  registerUser,
  connectSocket
} = require("./testUtils");

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

jest.setTimeout(15000);

test("session flow with sockets", async () => {
  const api = serverCtx.request;
  const { token: organizerToken } = await registerUser(api, "org2@example.com", "organizer");
  const { token: participantToken } = await registerUser(api, "user2@example.com", "participant");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      title: "Live Quiz",
      categories: ["math"],
      questions: [
        {
          type: "text",
          prompt: "1+1?",
          options: ["1", "2"],
          correctAnswers: ["2"],
          timeLimit: 2
        }
      ]
    });

  const startRes = await api
    .post(`/quizzes/${createRes.body.id}/start`)
    .set("Authorization", `Bearer ${organizerToken}`);

  expect(startRes.status).toBe(200);
  const roomCode = startRes.body.roomCode;

  const participantSocket = connectSocket(serverCtx.url, participantToken);
  const organizerSocket = connectSocket(serverCtx.url, organizerToken);

  const joinRes = await new Promise((resolve) => {
    participantSocket.emit("join_room", { roomCode }, (ack) => resolve(ack));
  });
  expect(joinRes.ok).toBe(true);

  const questionEvent = new Promise((resolve) => {
    participantSocket.on("question", resolve);
  });

  const nextRes = await new Promise((resolve) => {
    organizerSocket.emit("next_question", { roomCode }, (ack) => resolve(ack));
  });
  expect(nextRes.ok).toBe(true);

  const question = await questionEvent;
  expect(question.prompt).toBe("1+1?");

  const answerRes = await new Promise((resolve) => {
    participantSocket.emit(
      "submit_answer",
      { roomCode, questionId: question.id, answer: "2" },
      (ack) => resolve(ack)
    );
  });
  expect(answerRes.ok).toBe(true);
  expect(answerRes.isCorrect).toBe(true);

  const leaderboardEvent = await new Promise((resolve) => {
    participantSocket.on("leaderboard", resolve);
  });
  expect(leaderboardEvent.leaderboard[0].score).toBe(1);

  participantSocket.close();
  organizerSocket.close();
});

test("socket join requires auth", async () => {
  const api = serverCtx.request;
  const { token: organizerToken } = await registerUser(api, "org6@example.com", "organizer");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      title: "Auth Quiz",
      categories: ["general"],
      questions: []
    });

  const startRes = await api
    .post(`/quizzes/${createRes.body.id}/start`)
    .set("Authorization", `Bearer ${organizerToken}`);

  const roomCode = startRes.body.roomCode;
  const anonSocket = connectSocket(serverCtx.url, null);

  const joinRes = await new Promise((resolve) => {
    anonSocket.emit("join_room", { roomCode }, (ack) => resolve(ack));
  });
  expect(joinRes.error).toBe("Unauthorized");

  anonSocket.close();
});

test("participant cannot advance questions", async () => {
  const api = serverCtx.request;
  const { token: organizerToken } = await registerUser(api, "org7@example.com", "organizer");
  const { token: participantToken } = await registerUser(api, "user7@example.com", "participant");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      title: "Advance Quiz",
      categories: ["general"],
      questions: [
        {
          type: "text",
          prompt: "Q?",
          options: ["a"],
          correctAnswers: ["a"],
          timeLimit: 1
        }
      ]
    });

  const startRes = await api
    .post(`/quizzes/${createRes.body.id}/start`)
    .set("Authorization", `Bearer ${organizerToken}`);

  const roomCode = startRes.body.roomCode;
  const participantSocket = connectSocket(serverCtx.url, participantToken);

  const nextRes = await new Promise((resolve) => {
    participantSocket.emit("next_question", { roomCode }, (ack) => resolve(ack));
  });
  expect(nextRes.error).toBe("Forbidden");

  participantSocket.close();
});

test("cannot answer after question closes", async () => {
  const api = serverCtx.request;
  const { token: organizerToken } = await registerUser(api, "org8@example.com", "organizer");
  const { token: participantToken } = await registerUser(api, "user8@example.com", "participant");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      title: "Close Quiz",
      categories: ["general"],
      questions: [
        {
          type: "text",
          prompt: "Q?",
          options: ["a", "b"],
          correctAnswers: ["a"],
          timeLimit: 1
        }
      ]
    });

  const startRes = await api
    .post(`/quizzes/${createRes.body.id}/start`)
    .set("Authorization", `Bearer ${organizerToken}`);
  const roomCode = startRes.body.roomCode;

  const participantSocket = connectSocket(serverCtx.url, participantToken);
  const organizerSocket = connectSocket(serverCtx.url, organizerToken);

  await new Promise((resolve) => {
    participantSocket.emit("join_room", { roomCode }, () => resolve());
  });

  const questionEvent = new Promise((resolve) => {
    participantSocket.on("question", resolve);
  });

  await new Promise((resolve) => {
    organizerSocket.emit("next_question", { roomCode }, () => resolve());
  });

  const question = await questionEvent;
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const answerRes = await new Promise((resolve) => {
    participantSocket.emit(
      "submit_answer",
      { roomCode, questionId: question.id, answer: "a" },
      (ack) => resolve(ack)
    );
  });

  expect(answerRes.error).toBe("Question closed");

  participantSocket.close();
  organizerSocket.close();
});

test("cannot answer same question twice", async () => {
  const api = serverCtx.request;
  const { token: organizerToken } = await registerUser(api, "org9@example.com", "organizer");
  const { token: participantToken } = await registerUser(api, "user9@example.com", "participant");

  const createRes = await api
    .post("/quizzes")
    .set("Authorization", `Bearer ${organizerToken}`)
    .send({
      title: "Duplicate Quiz",
      categories: ["general"],
      questions: [
        {
          type: "text",
          prompt: "Q?",
          options: ["a", "b"],
          correctAnswers: ["a"],
          timeLimit: 2
        }
      ]
    });

  const startRes = await api
    .post(`/quizzes/${createRes.body.id}/start`)
    .set("Authorization", `Bearer ${organizerToken}`);
  const roomCode = startRes.body.roomCode;

  const participantSocket = connectSocket(serverCtx.url, participantToken);
  const organizerSocket = connectSocket(serverCtx.url, organizerToken);

  await new Promise((resolve) => {
    participantSocket.emit("join_room", { roomCode }, () => resolve());
  });

  const questionEvent = new Promise((resolve) => {
    participantSocket.on("question", resolve);
  });

  await new Promise((resolve) => {
    organizerSocket.emit("next_question", { roomCode }, () => resolve());
  });

  const question = await questionEvent;

  const firstRes = await new Promise((resolve) => {
    participantSocket.emit(
      "submit_answer",
      { roomCode, questionId: question.id, answer: "a" },
      (ack) => resolve(ack)
    );
  });
  expect(firstRes.ok).toBe(true);

  const secondRes = await new Promise((resolve) => {
    participantSocket.emit(
      "submit_answer",
      { roomCode, questionId: question.id, answer: "a" },
      (ack) => resolve(ack)
    );
  });
  expect(secondRes.error).toBe("Already answered");

  participantSocket.close();
  organizerSocket.close();
});
