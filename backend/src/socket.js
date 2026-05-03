const jwt = require("jsonwebtoken");
const { db } = require("./db");
const { jwtSecret } = require("./middleware/auth");
const { getSessionState, clearSessionState } = require("./socketState");

function attachSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next();
    }
    try {
      socket.user = jwt.verify(token, jwtSecret);
      return next();
    } catch (err) {
      return next();
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_room", (payload, ack) => {
      const { roomCode } = payload || {};
      const session = db.prepare("SELECT * FROM sessions WHERE room_code = ?").get(roomCode);
      if (!session || session.status !== "active") {
        if (ack) ack({ error: "Комната не найдена" });
        return;
      }
      if (!socket.user) {
        if (ack) ack({ error: "Требуется авторизация" });
        return;
      }

      socket.join(roomCode);

      if (socket.user.role === "participant") {
        const exists = db
          .prepare("SELECT 1 FROM session_participants WHERE session_id = ? AND user_id = ?")
          .get(session.id, socket.user.id);
        if (!exists) {
          db.prepare("INSERT INTO session_participants (session_id, user_id) VALUES (?, ?)").run(
            session.id,
            socket.user.id
          );
        }
      }

      emitParticipants(io, session.id, roomCode);
      emitLeaderboard(io, session.id, roomCode);

      const state = getSessionState(roomCode);
      if (state && state.currentQuestionId && Date.now() <= state.closesAt) {
        const question = db
          .prepare("SELECT * FROM questions WHERE id = ? AND quiz_id = ?")
          .get(state.currentQuestionId, session.quiz_id);
        if (question) {
          socket.emit("question", {
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            imageUrl: question.image_url,
            options: JSON.parse(question.options),
            timeLimit: question.time_limit,
            closesAt: state.closesAt,
            allowMultiple: JSON.parse(question.correct_answers).length > 1
          });
        }
      }

      if (ack) {
        ack({
          ok: true,
          session: {
            id: session.id,
            quizId: session.quiz_id,
            roomCode: session.room_code,
            currentQuestionIndex: session.current_question_index
          }
        });
      }
    });

    socket.on("next_question", (payload, ack) => {
      const { roomCode } = payload || {};
      if (!socket.user || socket.user.role !== "organizer") {
        if (ack) ack({ error: "Доступ запрещен" });
        return;
      }

      const session = db.prepare("SELECT * FROM sessions WHERE room_code = ?").get(roomCode);
      if (!session || session.status !== "active") {
        if (ack) ack({ error: "Комната не найдена" });
        return;
      }

      const state = getSessionState(roomCode);
      if (!state) {
        if (ack) ack({ error: "Сессия не готова" });
        return;
      }

      const result = advanceQuestion(io, session, state);
      if (ack) ack(result);
    });

    socket.on("submit_answer", (payload, ack) => {
      const { roomCode, questionId, answer } = payload || {};
      if (!socket.user) {
        if (ack) ack({ error: "Требуется авторизация" });
        return;
      }

      const session = db.prepare("SELECT * FROM sessions WHERE room_code = ?").get(roomCode);
      if (!session || session.status !== "active") {
        if (ack) ack({ error: "Комната не найдена" });
        return;
      }

      const state = getSessionState(roomCode);
      if (!state || state.currentQuestionId !== questionId || Date.now() > state.closesAt) {
        if (ack) ack({ error: "Вопрос закрыт" });
        return;
      }

      const question = db
        .prepare("SELECT * FROM questions WHERE id = ? AND quiz_id = ?")
        .get(questionId, session.quiz_id);
      if (!question) {
        if (ack) ack({ error: "Вопрос не найден" });
        return;
      }

      const existing = db
        .prepare("SELECT 1 FROM answers WHERE session_id = ? AND question_id = ? AND user_id = ?")
        .get(session.id, questionId, socket.user.id);
      if (existing) {
        if (ack) ack({ error: "Ответ уже отправлен" });
        return;
      }

      const correctAnswers = normalizeAnswers(JSON.parse(question.correct_answers));
      const normalizedAnswer = normalizeAnswers(Array.isArray(answer) ? answer : [answer]);
      const isCorrect =
        normalizedAnswer.length === correctAnswers.length &&
        normalizedAnswer.every((a) => correctAnswers.includes(a));

      db.prepare(
        "INSERT INTO answers (session_id, question_id, user_id, answer, is_correct) VALUES (?, ?, ?, ?, ?)"
      ).run(session.id, questionId, socket.user.id, JSON.stringify(normalizedAnswer), isCorrect ? 1 : 0);

      if (isCorrect) {
        db.prepare("UPDATE session_participants SET score = score + 1 WHERE session_id = ? AND user_id = ?")
          .run(session.id, socket.user.id);
      }

      emitLeaderboard(io, session.id, roomCode);
      if (ack) ack({ ok: true, isCorrect });
    });

    socket.on("leave_room", (payload) => {
      const { roomCode } = payload || {};
      socket.leave(roomCode);
    });
  });
}

function emitParticipants(io, sessionId, roomCode) {
  const participants = db
    .prepare(
      "SELECT users.id, users.email, session_participants.score FROM session_participants JOIN users ON users.id = session_participants.user_id WHERE session_participants.session_id = ? AND users.role = 'participant' ORDER BY users.email ASC"
    )
    .all(sessionId)
    .map((row) => ({
      userId: row.id,
      email: row.email,
      score: row.score
    }));

  io.to(roomCode).emit("participants", { participants });
}

function emitLeaderboard(io, sessionId, roomCode) {
  const leaderboard = db
    .prepare(
      "SELECT users.id, users.email, session_participants.score FROM session_participants JOIN users ON users.id = session_participants.user_id WHERE session_participants.session_id = ? AND users.role = 'participant' ORDER BY session_participants.score DESC, users.email ASC"
    )
    .all(sessionId)
    .map((row, index) => ({
      rank: index + 1,
      userId: row.id,
      email: row.email,
      score: row.score
    }));

  io.to(roomCode).emit("leaderboard", { leaderboard });
}

function endSession(io, session) {
  db.prepare("UPDATE sessions SET status = 'ended', ended_at = datetime('now') WHERE id = ?").run(session.id);
  emitLeaderboard(io, session.id, session.room_code);
  io.to(session.room_code).emit("session_ended", { sessionId: session.id });
  clearSessionState(session.room_code);
}

function normalizeAnswers(values) {
  const normalized = (values || [])
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => value.length > 0);
  return Array.from(new Set(normalized));
}

function advanceQuestion(io, session, state) {
  const questions = db
    .prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY position ASC")
    .all(session.quiz_id);

  const nextIndex = state.currentQuestionIndex + 1;
  if (nextIndex >= questions.length) {
    endSession(io, session);
    return { done: true };
  }

  const question = questions[nextIndex];
  const timeLimit = Number(question.time_limit) || 1;
  const closesAt = Date.now() + timeLimit * 1000;

  state.currentQuestionIndex = nextIndex;
  state.currentQuestionId = question.id;
  state.closesAt = closesAt;
  if (state.timerId) {
    clearTimeout(state.timerId);
  }

  state.timerId = setTimeout(() => {
    if (state.currentQuestionId !== question.id) return;
    const freshSession = db.prepare("SELECT * FROM sessions WHERE id = ?").get(session.id);
    if (!freshSession || freshSession.status !== "active") return;
    io.to(state.roomCode).emit("question_closed", { questionId: question.id });
    emitLeaderboard(io, session.id, state.roomCode);
    advanceQuestion(io, freshSession, state);
  }, timeLimit * 1000);

  db.prepare("UPDATE sessions SET current_question_index = ? WHERE id = ?").run(
    nextIndex,
    session.id
  );

  io.to(state.roomCode).emit("question", {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    imageUrl: question.image_url,
    options: JSON.parse(question.options),
    timeLimit,
    closesAt,
    allowMultiple: JSON.parse(question.correct_answers).length > 1
  });

  return { ok: true };
}

module.exports = { attachSocket };
