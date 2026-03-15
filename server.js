const express = require('express');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const FIRST_POINT_TIME_MS = 3000;
const ADDITIONAL_POINT_TIME_MS = 1400;
const SCORE_TIME_TOLERANCE_MS = 5000;
const SESSION_MAX_AGE_MS = 10 * 60 * 1000;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL no esta configurada.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getCurrentWeekKey(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
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

async function cleanupExpiredSessions() {
  await pool.query(
    `
      delete from public.game_sessions
      where expired_at < now()
    `
  );
}

app.get('/high-score', async (req, res) => {
  try {
    const currentWeekKey = getCurrentWeekKey();
    const result = await pool.query(
      `
        select
          player_name,
          player_identifier,
          score,
          duration_ms,
          achieved_at
        from public.scores
        where week_key = $1
        order by score desc, achieved_at asc
        limit 1
      `,
      [currentWeekKey]
    );

    if (result.rows.length === 0) {
      return res.json({
        name: '',
        id: '',
        score: 0,
        durationMs: 0,
        date: ''
      });
    }

    const row = result.rows[0];
    return res.json({
      name: row.player_name,
      id: row.player_identifier,
      score: row.score,
      durationMs: row.duration_ms,
      date: row.achieved_at
    });
  } catch (err) {
    console.error('Error reading high score:', err);
    return res.status(500).json({ error: 'No se pudo leer el high score.' });
  }
});

app.post('/game/start', async (req, res) => {
  try {
    await cleanupExpiredSessions();

    const sessionId = crypto.randomUUID();
    const result = await pool.query(
      `
        insert into public.game_sessions (id, expired_at)
        values ($1, now() + ($2 * interval '1 millisecond'))
        returning started_at
      `,
      [sessionId, SESSION_MAX_AGE_MS]
    );

    return res.json({
      sessionId,
      startedAt: new Date(result.rows[0].started_at).getTime()
    });
  } catch (err) {
    console.error('Error creating game session:', err);
    return res.status(500).json({ error: 'No se pudo iniciar la sesion de juego.' });
  }
});

app.post('/save-record', async (req, res) => {
  const client = await pool.connect();

  try {
    await cleanupExpiredSessions();

    const { name, id, score, durationMs, sessionId } = req.body;

    if (!name || !id || typeof score !== 'number' || typeof durationMs !== 'number' || !sessionId) {
      return res.status(400).json({ error: 'Datos incompletos.' });
    }

    await client.query('begin');

    const sessionResult = await client.query(
      `
        select id, started_at, used, expired_at
        from public.game_sessions
        where id = $1
        for update
      `,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('rollback');
      return res.status(400).json({ error: 'La sesion de juego no es valida o expiro.' });
    }

    const session = sessionResult.rows[0];

    if (session.used) {
      await client.query('rollback');
      return res.status(400).json({ error: 'La sesion de juego ya fue utilizada.' });
    }

    if (new Date(session.expired_at).getTime() < Date.now()) {
      await client.query('rollback');
      return res.status(400).json({ error: 'La sesion de juego expiro.' });
    }

    const sessionElapsedMs = Date.now() - new Date(session.started_at).getTime();

    if (durationMs > sessionElapsedMs + SCORE_TIME_TOLERANCE_MS) {
      await client.query('rollback');
      return res.status(400).json({
        error: 'La duracion reportada no coincide con la sesion de juego.'
      });
    }

    const effectiveDurationMs = Math.min(durationMs, sessionElapsedMs);

    if (!isScoreTimeCoherent(score, effectiveDurationMs)) {
      await client.query('rollback');
      return res.status(400).json({
        error: 'El puntaje no coincide con la duracion de la partida.'
      });
    }

    const currentWeekKey = getCurrentWeekKey();
    const currentHighScoreResult = await client.query(
      `
        select score
        from public.scores
        where week_key = $1
        order by score desc, achieved_at asc
        limit 1
      `,
      [currentWeekKey]
    );

    const currentWeeklyHighScore = currentHighScoreResult.rows[0]?.score ?? 0;

    await client.query(
      `
        update public.game_sessions
        set used = true
        where id = $1
      `,
      [sessionId]
    );

    if (score <= currentWeeklyHighScore) {
      await client.query('commit');
      return res.status(403).json({ error: 'El puntaje no es un nuevo record.' });
    }

    await client.query(
      `
        insert into public.scores (
          player_name,
          player_identifier,
          score,
          duration_ms,
          week_key,
          game_session_id
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [name, id, score, effectiveDurationMs, currentWeekKey, sessionId]
    );

    await client.query('commit');
    return res.json({ message: 'Nuevo record guardado.' });
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('Error saving record:', err);
    return res.status(500).json({ error: 'No se pudo guardar el record.' });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`FlappySunny servido en http://localhost:${PORT}`);
});
