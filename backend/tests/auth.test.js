const { resetDb, startTestServer, stopTestServer } = require("./testUtils");

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

jest.setTimeout(10000);

test("register/login/me flow", async () => {
  const api = serverCtx.request;

  const registerRes = await api.post("/auth/register").send({
    email: "user1@example.com",
    password: "pass123",
    role: "participant"
  });
  expect(registerRes.status).toBe(200);
  expect(registerRes.body.token).toBeTruthy();

  const loginRes = await api.post("/auth/login").send({
    email: "user1@example.com",
    password: "pass123"
  });
  expect(loginRes.status).toBe(200);

  const meRes = await api
    .get("/auth/me")
    .set("Authorization", `Bearer ${loginRes.body.token}`);
  expect(meRes.status).toBe(200);
  expect(meRes.body.user.email).toBe("user1@example.com");
});

test("register validates input and duplicates", async () => {
  const api = serverCtx.request;

  const badRes = await api.post("/auth/register").send({
    email: "",
    password: "pass123",
    role: "participant"
  });
  expect(badRes.status).toBe(400);

  const firstRes = await api.post("/auth/register").send({
    email: "dup@example.com",
    password: "pass123",
    role: "participant"
  });
  expect(firstRes.status).toBe(200);

  const dupRes = await api.post("/auth/register").send({
    email: "dup@example.com",
    password: "pass123",
    role: "participant"
  });
  expect(dupRes.status).toBe(409);
});

test("login rejects invalid credentials", async () => {
  const api = serverCtx.request;

  await api.post("/auth/register").send({
    email: "login@example.com",
    password: "pass123",
    role: "participant"
  });

  const wrongPass = await api.post("/auth/login").send({
    email: "login@example.com",
    password: "wrong"
  });
  expect(wrongPass.status).toBe(401);

  const unknown = await api.post("/auth/login").send({
    email: "nope@example.com",
    password: "pass123"
  });
  expect(unknown.status).toBe(401);
});
