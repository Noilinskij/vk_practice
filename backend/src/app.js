const express = require("express");
const cors = require("cors");
const { initDb } = require("./db");
const authRoutes = require("./routes/auth");
const quizRoutes = require("./routes/quizzes");
const sessionRoutes = require("./routes/sessions");

function createApp() {
  initDb();

  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => res.json({ ok: true }));
  app.use("/auth", authRoutes);
  app.use("/quizzes", quizRoutes);
  app.use("/", sessionRoutes);

  return app;
}

module.exports = { createApp };
