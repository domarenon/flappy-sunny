const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const HIGH_SCORE_PATH = path.join(__dirname, 'data', 'high_scores.json');
const FIRST_POINT_TIME_MS = 3000;
const ADDITIONAL_POINT_TIME_MS = 1400;
const SCORE_TIME_TOLERANCE_MS = 5000;
const SESSION_MAX_AGE_MS = 10 * 60 * 1000;
const gameSessions = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function cleanupExpiredSessions() {
  const now = Date.now();

  for (const [sessionId, session] of gameSessions.entries()) {
    if (now - session.startedAt > SESSION_MAX_AGE_MS) {
      gameSessions.delete(sessionId);
    }
  }
}

function isScoreTimeCoherent(score, durationMs) {
  if (!Number.isInteger(score) || score < 0) {
    return false;
  }

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return false;
  }

  if (score === 0) {
    return true;
  }

  const minimumRequiredMs =
    FIRST_POINT_TIME_MS + Math.max(score - 1, 0) * ADDITIONAL_POINT_TIME_MS;

  return durationMs + SCORE_TIME_TOLERANCE_MS >= minimumRequiredMs;
}

app.get('/high-score', (req, res) => {
  try {
    const scores = JSON.parse(fs.readFileSync(HIGH_SCORE_PATH, 'utf8'));
    res.json(scores.weekly_high_score);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el high score.' });
  }
});

app.post('/game/start', (req, res) => {
  cleanupExpiredSessions();

  const sessionId = crypto.randomUUID();
  const startedAt = Date.now();

  gameSessions.set(sessionId, {
    startedAt,
    used: false
  });

  res.json({ sessionId, startedAt });
});

app.post('/save-record', (req, res) => {
  cleanupExpiredSessions();

  const { name, id, score, durationMs, sessionId } = req.body;

  if (!name || !id || typeof score !== 'number' || typeof durationMs !== 'number' || !sessionId) {
    return res.status(400).json({ error: 'Datos incompletos.' });
  }

  const session = gameSessions.get(sessionId);

  if (!session) {
    return res.status(400).json({ error: 'La sesion de juego no es valida o expiro.' });
  }

  if (session.used) {
    return res.status(400).json({ error: 'La sesion de juego ya fue utilizada.' });
  }

  const sessionElapsedMs = Date.now() - session.startedAt;

  if (sessionElapsedMs > SESSION_MAX_AGE_MS) {
    gameSessions.delete(sessionId);
    return res.status(400).json({ error: 'La sesion de juego expiro.' });
  }

  if (durationMs > sessionElapsedMs + SCORE_TIME_TOLERANCE_MS) {
    return res.status(400).json({
      error: 'La duracion reportada no coincide con la sesion de juego.'
    });
  }

  const effectiveDurationMs = Math.min(durationMs, sessionElapsedMs);

  if (!isScoreTimeCoherent(score, effectiveDurationMs)) {
    return res.status(400).json({
      error: 'El puntaje no coincide con la duracion de la partida.'
    });
  }

  let scores;
  try {
    scores = JSON.parse(fs.readFileSync(HIGH_SCORE_PATH, 'utf8'));
  } catch (err) {
    scores = { weekly_high_score: { name: '', id: '', score: 0, date: '' } };
  }

  session.used = true;

  if (score > scores.weekly_high_score.score) {
    scores.weekly_high_score = {
      name,
      id,
      score,
      durationMs: effectiveDurationMs,
      date: new Date().toISOString()
    };

    fs.writeFileSync(HIGH_SCORE_PATH, JSON.stringify(scores, null, 2));
    return res.json({ message: 'Nuevo record guardado.' });
  }

  return res.status(403).json({ error: 'El puntaje no es un nuevo record.' });
});

app.listen(PORT, () => {
  console.log(`FlappySunny servido en http://localhost:${PORT}`);
});
