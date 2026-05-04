import React, { useEffect, useMemo, useState } from "react";
import { apiRequest, withAuth } from "./api";
import { createSocket } from "./socket";

const emptyQuestion = () => ({
  type: "text",
  prompt: "",
  imageUrl: "",
  options: "",
  correct: [],
  timeLimit: 20
});

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    role: "participant"
  });

  const [quizzes, setQuizzes] = useState([]);
  const [quizDetails, setQuizDetails] = useState(null);
  const [quizForm, setQuizForm] = useState({
    title: "",
    categories: "",
    questions: [emptyQuestion()]
  });
  const [organizerRoom, setOrganizerRoom] = useState(null);
  const [organizerSocket, setOrganizerSocket] = useState(null);
  const [organizerQuestion, setOrganizerQuestion] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [organizerError, setOrganizerError] = useState("");
  const [organizerHistory, setOrganizerHistory] = useState([]);
  const [organizerHistoryVisible, setOrganizerHistoryVisible] = useState(10);

  const [participantRoom, setParticipantRoom] = useState("");
  const [participantSocket, setParticipantSocket] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [quizStatus, setQuizStatus] = useState("idle");
  const [answerSelection, setAnswerSelection] = useState([]);
  const [participantError, setParticipantError] = useState("");
  const [participantStatus, setParticipantStatus] = useState("idle");
  const [now, setNow] = useState(Date.now());
  const [answerStatus, setAnswerStatus] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [participantHistory, setParticipantHistory] = useState([]);
  const [participantHistoryVisible, setParticipantHistoryVisible] = useState(10);
  const [activeTab, setActiveTab] = useState("quiz");

  const isOrganizer = user?.role === "organizer";

  const loadProfileHistory = () => {
    if (!token || !user) return;
    apiRequest("/profile/history", { method: "GET", ...withAuth(token) })
      .then((data) => {
        if (data.role === "participant") {
          setParticipantHistory(data.history || []);
          setParticipantHistoryVisible(10);
          setOrganizerHistory([]);
        } else {
          setOrganizerHistory(data.sessions || []);
          setOrganizerHistoryVisible(10);
          setParticipantHistory([]);
        }
      })
      .catch(() => {
        setParticipantHistory([]);
        setOrganizerHistory([]);
      });
  };

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    apiRequest("/auth/me", {
      method: "GET",
      ...withAuth(token)
    })
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("token");
        setToken("");
      });
  }, [token]);

  useEffect(() => {
    if (token && isOrganizer) {
      apiRequest("/quizzes", { method: "GET", ...withAuth(token) })
        .then((data) => setQuizzes(data.quizzes))
        .catch(() => setQuizzes([]));
    }
  }, [token, isOrganizer]);

  useEffect(() => {
    loadProfileHistory();
  }, [token, user]);

  useEffect(() => {
    return () => {
      if (organizerSocket) organizerSocket.disconnect();
      if (participantSocket) participantSocket.disconnect();
    };
  }, [organizerSocket, participantSocket]);

  useEffect(() => {
    const timerId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerId);
  }, []);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError("");

    try {
      if (authMode === "login") {
        const data = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password
          })
        });
        localStorage.setItem("token", data.token);
        setToken(data.token);
      } else {
        const data = await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify(authForm)
        });
        localStorage.setItem("token", data.token);
        setToken(data.token);
      }
    } catch (err) {
      setAuthError(err.message || "Ошибка авторизации");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setOrganizerRoom(null);
    setOrganizerQuestion(null);
    setParticipants([]);
    setOrganizerError("");
    setOrganizerHistory([]);
    setOrganizerHistoryVisible(10);
    setQuizDetails(null);
    setParticipantRoom("");
    setCurrentQuestion(null);
    setLeaderboard([]);
    setParticipantStatus("idle");
    setAnswerStatus("");
    setShowResults(false);
    setParticipantHistory([]);
    setParticipantHistoryVisible(10);
    setActiveTab("quiz");
    if (organizerSocket) organizerSocket.disconnect();
    if (participantSocket) participantSocket.disconnect();
  };

  const updateQuizQuestion = (index, updates) => {
    setQuizForm((prev) => {
      const next = [...prev.questions];
      next[index] = { ...next[index], ...updates };
      return { ...prev, questions: next };
    });
  };

  const addQuestion = () => {
    setOrganizerError("");
    setQuizForm((prev) => {
      if (prev.questions.length >= 20) {
        setOrganizerError("В одном квизе может быть максимум 20 вопросов");
        return prev;
      }
      return { ...prev, questions: [...prev.questions, emptyQuestion()] };
    });
  };

  const removeQuestion = (index) => {
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, idx) => idx !== index)
    }));
  };

  const handleCreateQuiz = async (event) => {
    event.preventDefault();
    setOrganizerError("");
    if (quizzes.length >= 5) {
      setOrganizerError("Организатор может иметь максимум 5 квизов");
      return;
    }
    const normalizedTitle = quizForm.title.trim().toLowerCase();
    const hasDuplicateTitle = quizzes.some(
      (quiz) => quiz.title.trim().toLowerCase() === normalizedTitle
    );
    if (hasDuplicateTitle) {
      setOrganizerError("Квиз с таким названием уже существует");
      return;
    }
    if (quizForm.questions.length > 20) {
      setOrganizerError("В одном квизе может быть максимум 20 вопросов");
      return;
    }
    const categories = quizForm.categories
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const questions = quizForm.questions
      .map((q) => ({
        type: q.type,
        prompt: q.prompt,
        imageUrl: q.imageUrl || null,
        options: q.options
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        correctAnswers: Array.isArray(q.correct) ? q.correct : [],
        timeLimit: Number(q.timeLimit) || 20
      }))
      .map((q) => ({
        ...q,
        correctAnswers: q.correctAnswers.filter((answer) => q.options.includes(answer))
      }))
      .filter((q) => q.prompt && q.options.length);

    const hasMissingCorrect = questions.some((q) => !q.correctAnswers.length);
    if (hasMissingCorrect) {
      setOrganizerError("В каждом вопросе должен быть хотя бы один правильный ответ");
      return;
    }

    await apiRequest("/quizzes", {
      method: "POST",
      body: JSON.stringify({
        title: quizForm.title,
        categories,
        questions
      }),
      ...withAuth(token)
    });

    const data = await apiRequest("/quizzes", { method: "GET", ...withAuth(token) });
    setQuizzes(data.quizzes);
    setQuizForm({ title: "", categories: "", questions: [emptyQuestion()] });
  };

  const handleStartSession = async (quizId) => {
    const data = await apiRequest(`/quizzes/${quizId}/start`, {
      method: "POST",
      ...withAuth(token)
    });
    setOrganizerRoom(data.roomCode);
    if (organizerSocket) organizerSocket.disconnect();
    const socket = createSocket(token);
    setOrganizerSocket(socket);
    setQuizStatus("live");

    socket.emit("join_room", { roomCode: data.roomCode }, () => {});
    socket.on("question", (payload) => {
      setOrganizerQuestion(payload);
    });
    socket.on("participants", (payload) => {
      setParticipants(payload.participants || []);
    });
    socket.on("leaderboard", (payload) => {
      const board = payload.leaderboard || [];
      setLeaderboard(board);
      setParticipants(
        board.map((entry) => ({
          userId: entry.userId,
          email: entry.email,
          score: entry.score
        }))
      );
    });
    socket.on("session_ended", () => {
      setQuizStatus("ended");
      setShowResults(true);
      setOrganizerQuestion(null);
      loadProfileHistory();
    });
  };

  const handleOpenQuizDetails = async (quizId) => {
    const data = await apiRequest(`/quizzes/${quizId}`, {
      method: "GET",
      ...withAuth(token)
    });
    setQuizDetails(data.quiz);
    setOrganizerError("");
  };

  const handleCloseQuizDetails = () => {
    setQuizDetails(null);
    setOrganizerError("");
  };

  const handleDeleteQuiz = async (quizId) => {
    const confirmed = window.confirm("Удалить квиз без возможности восстановления?");
    if (!confirmed) return;
    try {
      await apiRequest(`/quizzes/${quizId}`, {
        method: "DELETE",
        ...withAuth(token)
      });
      const data = await apiRequest("/quizzes", { method: "GET", ...withAuth(token) });
      setQuizzes(data.quizzes);
      setQuizDetails(null);
      setOrganizerError("");
    } catch (err) {
      setOrganizerError(err.message || "Не удалось удалить квиз");
    }
  };

  const organizerNextQuestion = () => {
    if (!organizerRoom || !organizerSocket) return;
    organizerSocket.emit("next_question", { roomCode: organizerRoom }, () => {});
  };

  const participantJoinRoom = () => {
    setParticipantError("");
    setAnswerStatus("");
    setCurrentQuestion(null);
    setAnswerSelection([]);
    setLeaderboard([]);
    setQuizStatus("idle");
    setShowResults(false);
    if (!participantRoom) return;
    if (participantSocket) participantSocket.disconnect();

    const socket = createSocket(token);
    setParticipantSocket(socket);

    setParticipantStatus("connecting");
    socket.on("connect", () => {
      socket.emit("join_room", { roomCode: participantRoom }, (ack) => {
        if (ack?.error) {
          setParticipantError(ack.error);
          setParticipantStatus("error");
          socket.disconnect();
          return;
        }
        setQuizStatus("live");
        if (ack?.session?.currentQuestionIndex >= 0) {
          setParticipantStatus("idle");
        } else {
          setParticipantStatus("connected");
        }
      });
    });

    socket.on("connect_error", () => {
      setParticipantStatus("error");
      setParticipantError("Не удалось подключиться к серверу");
    });

    socket.on("question", (payload) => {
      setCurrentQuestion(payload);
      setAnswerSelection([]);
      setAnswerStatus("");
      setParticipantStatus("idle");
    });

    socket.on("leaderboard", (payload) => {
      setLeaderboard(payload.leaderboard || []);
    });

    socket.on("participants", (payload) => {
      setParticipants(payload.participants || []);
    });

    socket.on("session_ended", () => {
      setQuizStatus("ended");
      setShowResults(true);
      loadProfileHistory();
    });
  };

  const submitAnswer = () => {
    if (!participantSocket || !currentQuestion) return;
    const answerPayload = currentQuestion.allowMultiple ? answerSelection : answerSelection[0];
    participantSocket.emit(
      "submit_answer",
      {
        roomCode: participantRoom,
        questionId: currentQuestion.id,
        answer: answerPayload
      },
      (ack) => {
        if (ack?.error) {
          setParticipantError(ack.error);
          setAnswerStatus("");
          return;
        }
        setAnswerStatus(ack?.isCorrect ? "Ответ принят (верно)" : "Ответ принят");
      }
    );
  };

  const formattedTimer = useMemo(() => {
    if (!currentQuestion?.closesAt) return "";
    const remaining = Math.max(0, Math.ceil((currentQuestion.closesAt - now) / 1000));
    return `${remaining}s`;
  }, [currentQuestion, now]);

  const organizerTimer = useMemo(() => {
    if (!organizerQuestion?.closesAt) return "";
    const remaining = Math.max(0, Math.ceil((organizerQuestion.closesAt - now) / 1000));
    return `${remaining}s`;
  }, [organizerQuestion, now]);

  return (
    <div className="app">
      <div className="ambient" />
      <header className="hero">
        <div>
          <p className="overline">QuizFlow</p>
          <h1>Студия живых квизов</h1>
          <p className="subtitle">
            Создавай интерактивные квизы, запускай комнаты и смотри лидерборды в реальном
            времени.
          </p>
        </div>
        {user ? (
          <div className="chip">
            <div>
              <strong>{user.email}</strong>
              <span>{user.role}</span>
            </div>
            <button className="ghost" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        ) : null}
      </header>

      {!user ? (
        <section className="card">
          <div className="tabs">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Вход
            </button>
            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Регистрация
            </button>
          </div>
          <form className="stack" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((prev) => ({ ...prev, email: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((prev) => ({ ...prev, password: event.target.value }))
                }
                required
              />
            </label>
            {authMode === "register" ? (
              <label>
                Роль
                <select
                  value={authForm.role}
                  onChange={(event) =>
                    setAuthForm((prev) => ({ ...prev, role: event.target.value }))
                  }
                >
                  <option value="participant">Участник</option>
                  <option value="organizer">Организатор</option>
                </select>
              </label>
            ) : null}
            {authError ? <p className="error">{authError}</p> : null}
            <button className="primary" type="submit">
              {authMode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="tabs">
            <button
              className={activeTab === "quiz" ? "active" : ""}
              onClick={() => setActiveTab("quiz")}
            >
              Квиз
            </button>
            <button
              className={activeTab === "profile" ? "active" : ""}
              onClick={() => setActiveTab("profile")}
            >
              Личный кабинет
            </button>
          </div>
          {activeTab === "profile" ? (
            <section className="grid">
              {isOrganizer ? (
                <div className="card">
                  <h2>История проведенных квизов</h2>
                  {organizerHistory.length === 0 ? (
                    <p className="muted">Пока нет истории.</p>
                  ) : (
                    <div className="leaderboard">
                      {organizerHistory.slice(0, organizerHistoryVisible).map((item) => (
                        <div key={item.session_id} className="leader-row">
                          <div>
                            <span>
                              Название: {item.quiz_title} Победитель: {item.winner_email || "—"}
                            </span>
                          </div>
                          <span>{item.started_at || "—"}</span>
                        </div>
                      ))}
                      {organizerHistory.length > organizerHistoryVisible ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setOrganizerHistoryVisible((prev) => prev + 10)}
                        >
                          Показать еще
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="card">
                  <h2>История участия</h2>
                  {participantHistory.length === 0 ? (
                    <p className="muted">Пока нет истории.</p>
                  ) : (
                    <div className="leaderboard">
                      {participantHistory.slice(0, participantHistoryVisible).map((item) => (
                        <div key={`${item.session_id}-${item.quiz_title}`} className="leader-row">
                          <div>
                            <span>Название: {item.quiz_title} Место: {item.place || "—"}</span>
                          </div>
                          <span>{item.score} баллов</span>
                        </div>
                      ))}
                      {participantHistory.length > participantHistoryVisible ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setParticipantHistoryVisible((prev) => prev + 10)}
                        >
                          Показать еще
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="grid">
              {isOrganizer ? (
                <>
              <div className="card">
                <h2>Кабинет организатора</h2>
                <form className="stack" onSubmit={handleCreateQuiz}>
                  {organizerError ? <p className="error">{organizerError}</p> : null}
                  <label>
                    Название квиза
                    <input
                      value={quizForm.title}
                      onChange={(event) =>
                        setQuizForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                      required
                    />
                  </label>

                  <div className="question-list">
                    {quizForm.questions.map((question, index) => (
                      <div className="question" key={`q-${index}`}>
                        <div className="question-header">
                          <h3>Вопрос {index + 1}</h3>
                          {quizForm.questions.length > 1 ? (
                            <button type="button" className="danger" onClick={() => removeQuestion(index)}>
                              Удалить
                            </button>
                          ) : null}
                        </div>
                        <label>
                          Тип
                          <select
                            value={question.type}
                            onChange={(event) =>
                              updateQuizQuestion(index, { type: event.target.value })
                            }
                          >
                            <option value="text">Текст</option>
                            <option value="image">Изображение</option>
                          </select>
                        </label>
                        <label>
                          Текст вопроса
                          <input
                            value={question.prompt}
                            onChange={(event) =>
                              updateQuizQuestion(index, { prompt: event.target.value })
                            }
                            required
                          />
                        </label>
                        {question.type === "image" ? (
                          <label>
                            Ссылка на изображение
                            <input
                              value={question.imageUrl}
                              onChange={(event) =>
                                updateQuizQuestion(index, { imageUrl: event.target.value })
                              }
                            />
                          </label>
                        ) : null}
                        <label>
                          Варианты ответов (по одному в строке)
                          <textarea
                            rows={4}
                            value={question.options}
                            onChange={(event) => {
                              const value = event.target.value;
                              const parsedOptions = value
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean);
                              const nextCorrect = Array.isArray(question.correct)
                                ? question.correct.filter((answer) => parsedOptions.includes(answer))
                                : [];
                              updateQuizQuestion(index, { options: value, correct: nextCorrect });
                            }}
                          />
                        </label>
                        <div className="stack">
                          <p className="muted">Правильные ответы</p>
                          {question.options
                            .split("\n")
                            .map((item) => item.trim())
                            .filter(Boolean)
                            .map((option) => {
                              const checked = Array.isArray(question.correct)
                                ? question.correct.includes(option)
                                : false;
                              return (
                                <label key={option} className="checkbox-row">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      const nextCorrect = Array.isArray(question.correct)
                                        ? [...question.correct]
                                        : [];
                                      if (event.target.checked) {
                                        nextCorrect.push(option);
                                      } else {
                                        const idx = nextCorrect.indexOf(option);
                                        if (idx >= 0) nextCorrect.splice(idx, 1);
                                      }
                                      updateQuizQuestion(index, { correct: nextCorrect });
                                    }}
                                  />
                                  <span>{option}</span>
                                </label>
                              );
                            })}
                          {question.options.trim().length === 0 ? (
                            <p className="muted space-lg">Сначала добавьте варианты ответа.</p>
                          ) : null}
                        </div>
                        <label>
                          Лимит времени (сек)
                          <input
                            type="number"
                            min="5"
                            value={question.timeLimit}
                            onChange={(event) =>
                              updateQuizQuestion(index, { timeLimit: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="ghost" onClick={addQuestion}>
                    Добавить вопрос
                  </button>
                  <button className="primary" type="submit">
                    Сохранить квиз
                  </button>
                </form>
              </div>

              <div className="card">
                <h2>Мои квизы</h2>
                <div className="quiz-list">
                  {quizzes.length === 0 ? (
                    <p className="muted">Пока нет квизов</p>
                  ) : (
                    quizzes.map((quiz) => (
                      <div className="quiz-row" key={quiz.id}>
                        <div>
                          <strong>{quiz.title}</strong>
                          <span>{quiz.categories.join(", ")}</span>
                        </div>
                        <div className="row-actions">
                          <button
                            className="ghost"
                            onClick={() => handleOpenQuizDetails(quiz.id)}
                          >
                            Детали
                          </button>
                          <button className="primary" onClick={() => handleStartSession(quiz.id)}>
                            Запустить
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {quizDetails ? (
                  <div className="live-panel">
                    <div className="panel-header">
                      <h3>Квиз: {quizDetails.title}</h3>
                      <div className="row-actions">
                        <button
                          className="danger"
                          onClick={() => handleDeleteQuiz(quizDetails.id)}
                        >
                          Удалить квиз
                        </button>
                        <button className="ghost" onClick={handleCloseQuizDetails}>
                          Закрыть
                        </button>
                      </div>
                    </div>
                    {organizerError ? <p className="error">{organizerError}</p> : null}
                    <p className="muted">Категории: {quizDetails.categories.join(", ")}</p>
                    <div className="question-list">
                      {quizDetails.questions.map((question) => (
                        <div className="question" key={question.id}>
                          <h4>{question.prompt}</h4>
                          {question.imageUrl ? (
                            <img src={question.imageUrl} alt="question" />
                          ) : null}
                          <p className="muted">Тип: {question.type}</p>
                          <p className="muted">
                            Варианты: {question.options.join(", ") || "—"}
                          </p>
                          <p className="muted">
                            Правильные ответы: {question.correctAnswers.join(", ") || "—"}
                          </p>
                          <p className="muted">Лимит: {question.timeLimit} сек</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="live-panel">
                  <h3>Управление эфиром</h3>
                  <p className="muted">
                    {organizerRoom
                      ? `Код комнаты: ${organizerRoom}`
                      : "Запустите сессию, чтобы получить код комнаты."}
                  </p>
                  <button className="primary" onClick={organizerNextQuestion}>
                    {organizerQuestion ? "Следующий вопрос" : "Начать квиз"}
                  </button>
                </div>

                <div className="live-panel">
                  <h3>Текущий вопрос</h3>
                  {quizStatus === "ended" ? (
                    <div className="finish-card">
                      <h3>Квиз завершен</h3>
                      <p className="muted">Сессия завершена.</p>
                    </div>
                  ) : organizerQuestion ? (
                    <div className="stack">
                      <p className="muted">Осталось времени: {organizerTimer}</p>
                      <strong>{organizerQuestion.prompt}</strong>
                      {organizerQuestion.imageUrl ? (
                        <img src={organizerQuestion.imageUrl} alt="question" />
                      ) : null}
                      <div className="options">
                        {organizerQuestion.options?.map((option) => (
                          <div key={option} className="option">
                            {option}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Вопрос еще не запущен.</p>
                  )}
                </div>

                <div className="live-panel">
                  <h3>Участники</h3>
                  {participants.length === 0 ? (
                    <p className="muted">Пока никто не подключился.</p>
                  ) : (
                    <div className="leaderboard">
                      {participants.map((entry) => (
                        <div key={entry.userId} className="leader-row">
                          <strong>{entry.email}</strong>
                          <span>{entry.score} баллов</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </>
          ) : (
            <>
              <div className="card">
                <h2>Подключиться к квизу</h2>
                <label>
                  Код комнаты
                  <input
                    value={participantRoom}
                    onChange={(event) => setParticipantRoom(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                  />
                </label>
                {participantStatus === "connecting" ? (
                  <p className="muted">Подключение к комнате...</p>
                ) : null}
                {participantStatus === "connected" ? (
                  <p className="muted">Подключено. Ожидайте старт.</p>
                ) : null}
                {participantError ? <p className="error">{participantError}</p> : null}
                <button className="primary" onClick={participantJoinRoom}>
                  Войти в комнату
                </button>
              </div>

              <div className="card">
                <h2>Текущий вопрос</h2>
                {quizStatus === "ended" ? (
                  <div className="stack">
                    <div className="finish-card">
                      <h3>Квиз завершен</h3>
                      <p className="muted">Спасибо за участие!</p>
                    </div>
                  </div>
                ) : currentQuestion ? (
                  <div className="stack">
                    <div className="question-card">
                      <p className="muted">Осталось времени: {formattedTimer}</p>
                      <h3>{currentQuestion.prompt}</h3>
                      {currentQuestion.imageUrl ? (
                        <img src={currentQuestion.imageUrl} alt="question" />
                      ) : null}
                      <div className={currentQuestion.allowMultiple ? "options multi" : "options single"}>
                        {currentQuestion.options.map((option) => {
                          const active = answerSelection.includes(option);
                          return (
                            <button
                              type="button"
                              key={option}
                              className={active ? "option active" : "option"}
                              onClick={() => {
                                setAnswerSelection((prev) => {
                                  if (prev.includes(option)) {
                                    return prev.filter((item) => item !== option);
                                  }
                                  if (!currentQuestion.allowMultiple) {
                                    return [option];
                                  }
                                  return [...prev, option];
                                });
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {answerStatus ? <p className="muted">{answerStatus}</p> : null}
                    <button
                      className="primary"
                      onClick={submitAnswer}
                      disabled={answerSelection.length === 0}
                    >
                      Отправить ответ
                    </button>
                  </div>
                ) : (
                  <p className="muted">Ожидание старта от организатора.</p>
                )}
              </div>

              <div className="card">
                <h2>Лидерборд</h2>
                {leaderboard.length === 0 ? (
                  <p className="muted">Пока нет результатов.</p>
                ) : (
                  <div className={showResults ? "leaderboard podium" : "leaderboard"}>
                    {leaderboard.map((entry, index) => (
                      <div key={entry.userId} className={index < 3 ? "leader-row top" : "leader-row"}>
                        <span>#{entry.rank}</span>
                        <strong>{entry.email}</strong>
                        <span>{entry.score} баллов</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </>
          )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
