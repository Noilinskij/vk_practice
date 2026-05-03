const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET || "change_me";

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Требуется авторизация" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Недействительный токен" });
  }
}

function roleRequired(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "Доступ запрещен" });
    }
    return next();
  };
}

module.exports = { authRequired, roleRequired, jwtSecret };
