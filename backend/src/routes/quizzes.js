const express = require("express");
const { db } = require("../db");
const { authRequired, roleRequired } = require("../middleware/auth");

const router = express.Router();

function normalizeQuestions(questions) {
  return (questions || []).map((q, index) => ({
    type: q.type,
    prompt: q.prompt,
    imageUrl: q.imageUrl || null,
    options: q.options || [],
    correctAnswers: q.correctAnswers || [],
    timeLimit: Number.isInteger(q.timeLimit) ? q.timeLimit : 20,
    position: index
  }));
}

router.post("/", authRequired, roleRequired("organizer"), (req, res) => {
  const { title, categories, questions } = req.body || {};
  if (!title || !Array.isArray(categories)) {
    return res.status(400).json({ error: "Требуются название и категории" });
  }

  const existingCount = db
    .prepare("SELECT COUNT(*) AS count FROM quizzes WHERE organizer_id = ? AND deleted_at IS NULL")
    .get(req.user.id);
  if (existingCount.count >= 5) {
    return res.status(400).json({ error: "Организатор может иметь максимум 5 квизов" });
  }

  const duplicate = db
    .prepare(
      "SELECT 1 FROM quizzes WHERE organizer_id = ? AND deleted_at IS NULL AND LOWER(title) = LOWER(?)"
    )
    .get(req.user.id, title);
  if (duplicate) {
    return res.status(400).json({ error: "Квиз с таким названием уже существует" });
  }

  const quizInfo = db
    .prepare("INSERT INTO quizzes (organizer_id, title, categories) VALUES (?, ?, ?)")
    .run(req.user.id, title, JSON.stringify(categories));

  const quizId = quizInfo.lastInsertRowid;
  const normalizedQuestions = normalizeQuestions(questions);
  if (normalizedQuestions.length > 20) {
    return res.status(400).json({ error: "В одном квизе может быть максимум 20 вопросов" });
  }
  const missingCorrect = normalizedQuestions.some((q) => !Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0);
  if (missingCorrect) {
    return res.status(400).json({ error: "В каждом вопросе должен быть хотя бы один правильный ответ" });
  }
  const insertQuestion = db.prepare(
    "INSERT INTO questions (quiz_id, type, prompt, image_url, options, correct_answers, time_limit, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const insertMany = db.transaction((items) => {
    for (const q of items) {
      insertQuestion.run(
        quizId,
        q.type,
        q.prompt,
        q.imageUrl,
        JSON.stringify(q.options),
        JSON.stringify(q.correctAnswers),
        q.timeLimit,
        q.position
      );
    }
  });

  insertMany(normalizedQuestions);

  return res.json({ id: quizId });
});

router.get("/", authRequired, roleRequired("organizer"), (req, res) => {
  const quizzes = db
    .prepare(
      "SELECT id, title, categories, created_at FROM quizzes WHERE organizer_id = ? AND deleted_at IS NULL ORDER BY id DESC"
    )
    .all(req.user.id)
    .map((q) => ({
      ...q,
      categories: JSON.parse(q.categories)
    }));

  return res.json({ quizzes });
});

router.get("/:id", authRequired, roleRequired("organizer"), (req, res) => {
  const quiz = db
    .prepare("SELECT * FROM quizzes WHERE id = ? AND organizer_id = ? AND deleted_at IS NULL")
    .get(req.params.id, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: "Квиз не найден" });
  }

  const questions = db
    .prepare("SELECT * FROM questions WHERE quiz_id = ? ORDER BY position ASC")
    .all(quiz.id)
    .map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      imageUrl: q.image_url,
      options: JSON.parse(q.options),
      correctAnswers: JSON.parse(q.correct_answers),
      timeLimit: q.time_limit,
      position: q.position
    }));

  return res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      categories: JSON.parse(quiz.categories),
      createdAt: quiz.created_at,
      questions
    }
  });
});

router.put("/:id", authRequired, roleRequired("organizer"), (req, res) => {
  const { title, categories, questions } = req.body || {};
  const quiz = db
    .prepare("SELECT id FROM quizzes WHERE id = ? AND organizer_id = ? AND deleted_at IS NULL")
    .get(req.params.id, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: "Квиз не найден" });
  }

  if (title) {
    const duplicate = db
      .prepare(
        "SELECT 1 FROM quizzes WHERE organizer_id = ? AND deleted_at IS NULL AND LOWER(title) = LOWER(?) AND id <> ?"
      )
      .get(req.user.id, title, quiz.id);
    if (duplicate) {
      return res.status(400).json({ error: "Квиз с таким названием уже существует" });
    }
    db.prepare("UPDATE quizzes SET title = ? WHERE id = ?").run(title, quiz.id);
  }
  if (Array.isArray(categories)) {
    db.prepare("UPDATE quizzes SET categories = ? WHERE id = ?").run(JSON.stringify(categories), quiz.id);
  }

  if (Array.isArray(questions)) {
    const normalizedQuestions = normalizeQuestions(questions);
    if (normalizedQuestions.length > 20) {
      return res.status(400).json({ error: "В одном квизе может быть максимум 20 вопросов" });
    }
    const missingCorrect = normalizedQuestions.some(
      (q) => !Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0
    );
    if (missingCorrect) {
      return res.status(400).json({ error: "В каждом вопросе должен быть хотя бы один правильный ответ" });
    }
    db.prepare("DELETE FROM questions WHERE quiz_id = ?").run(quiz.id);
    const insertQuestion = db.prepare(
      "INSERT INTO questions (quiz_id, type, prompt, image_url, options, correct_answers, time_limit, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertMany = db.transaction((items) => {
      for (const q of items) {
        insertQuestion.run(
          quiz.id,
          q.type,
          q.prompt,
          q.imageUrl,
          JSON.stringify(q.options),
          JSON.stringify(q.correctAnswers),
          q.timeLimit,
          q.position
        );
      }
    });
    insertMany(normalizedQuestions);
  }

  return res.json({ ok: true });
});

router.delete("/:id", authRequired, roleRequired("organizer"), (req, res) => {
  const quiz = db
    .prepare("SELECT id FROM quizzes WHERE id = ? AND organizer_id = ? AND deleted_at IS NULL")
    .get(req.params.id, req.user.id);
  if (!quiz) {
    return res.status(404).json({ error: "Квиз не найден" });
  }

  db.prepare("UPDATE quizzes SET deleted_at = datetime('now') WHERE id = ?").run(quiz.id);
  return res.json({ ok: true });
});

module.exports = router;
