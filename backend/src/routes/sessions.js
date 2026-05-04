const express = require("express");
const { db } = require("../db");
const { authRequired, roleRequired } = require("../middleware/auth");
const { createSessionState } = require("../socketState");

const router = express.Router();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post("/quizzes/:id/start", authRequired, roleRequired("organizer"), (req, res) => {
  const quiz = db
    .prepare("SELECT id FROM quizzes WHERE id = ? AND organizer_id = ? AND deleted_at IS NULL")
    .get(req.params.id, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: "Квиз не найден" });
  }

  let roomCode = generateRoomCode();
  while (db.prepare("SELECT id FROM sessions WHERE room_code = ?").get(roomCode)) {
    roomCode = generateRoomCode();
  }

  const info = db
    .prepare("INSERT INTO sessions (quiz_id, room_code, status) VALUES (?, ?, 'active')")
    .run(quiz.id, roomCode);

  createSessionState(info.lastInsertRowid, quiz.id, roomCode);

  return res.json({
    sessionId: info.lastInsertRowid,
    roomCode
  });
});

router.get("/sessions/:code", authRequired, (req, res) => {
  const session = db
    .prepare("SELECT * FROM sessions WHERE room_code = ?")
    .get(req.params.code);
  if (!session) {
    return res.status(404).json({ error: "Комната не найдена" });
  }

  return res.json({
    session: {
      id: session.id,
      quizId: session.quiz_id,
      roomCode: session.room_code,
      status: session.status,
      currentQuestionIndex: session.current_question_index
    }
  });
});

module.exports = router;
