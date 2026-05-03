const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../db");
const { authRequired, jwtSecret } = require("../middleware/auth");

const router = express.Router();

router.post("/register", (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password || !role) {
    return res.status(400).json({ error: "Требуются email, пароль и роль" });
  }
  if (!['participant', 'organizer'].includes(role)) {
    return res.status(400).json({ error: "Роль должна быть participant или organizer" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Email уже зарегистрирован" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)")
    .run(email, passwordHash, role);

  const user = { id: info.lastInsertRowid, email, role };
  const token = jwt.sign(user, jwtSecret, { expiresIn: "7d" });
  return res.json({ user, token });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Требуются email и пароль" });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) {
    return res.status(401).json({ error: "Неверные учетные данные" });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Неверные учетные данные" });
  }

  const payload = { id: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
  return res.json({ user: payload, token });
});

router.get("/me", authRequired, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
