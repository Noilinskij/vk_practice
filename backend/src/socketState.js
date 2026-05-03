const sessionStates = new Map();

function createSessionState(sessionId, quizId, roomCode) {
  if (!sessionStates.has(roomCode)) {
    sessionStates.set(roomCode, {
      sessionId,
      quizId,
      roomCode,
      currentQuestionId: null,
      currentQuestionIndex: -1,
      closesAt: null,
      timerId: null
    });
  }
  return sessionStates.get(roomCode);
}

function getSessionState(roomCode) {
  return sessionStates.get(roomCode);
}

function clearSessionState(roomCode) {
  const state = sessionStates.get(roomCode);
  if (state && state.timerId) {
    clearTimeout(state.timerId);
  }
  sessionStates.delete(roomCode);
}

module.exports = {
  createSessionState,
  getSessionState,
  clearSessionState
};
