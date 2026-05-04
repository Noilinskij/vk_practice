const express = require("express");
const { db } = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/history", authRequired, (req, res) => {
  if (req.user.role === "participant") {
    const history = db
      .prepare(
        "SELECT sessions.id AS session_id, quizzes.title AS quiz_title, sessions.room_code, sessions.status, sessions.started_at, sessions.ended_at, " +
          "session_participants.score, " +
          "(SELECT 1 + COUNT(*) FROM session_participants sp2 " +
          "WHERE sp2.session_id = session_participants.session_id " +
          "AND sp2.score > session_participants.score) AS place " +
          "FROM session_participants " +
          "JOIN sessions ON sessions.id = session_participants.session_id " +
          "JOIN quizzes ON quizzes.id = sessions.quiz_id " +
          "WHERE session_participants.user_id = ? " +
          "ORDER BY sessions.id DESC"
      )
      .all(req.user.id);

    return res.json({
      role: "participant",
      history
    });
  }

  const sessions = db
    .prepare(
      "SELECT sessions.id AS session_id, quizzes.title AS quiz_title, sessions.room_code, " +
        "sessions.started_at, sessions.ended_at, " +
        "(SELECT users.email FROM session_participants sp " +
        "JOIN users ON users.id = sp.user_id " +
        "WHERE sp.session_id = sessions.id " +
        "ORDER BY sp.score DESC, sp.joined_at ASC " +
        "LIMIT 1) AS winner_email " +
        "FROM sessions " +
        "JOIN quizzes ON quizzes.id = sessions.quiz_id " +
        "WHERE quizzes.organizer_id = ? " +
        "ORDER BY sessions.id DESC"
    )
    .all(req.user.id);

  return res.json({
    role: "organizer",
    sessions
  });
});

module.exports = router;
