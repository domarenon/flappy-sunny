const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const HIGH_SCORE_PATH = path.join(__dirname, 'data', 'high_scores.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/high-score', (req, res) => {
  try {
    const scores = JSON.parse(fs.readFileSync(HIGH_SCORE_PATH, 'utf8'));
    res.json(scores.weekly_high_score);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el high score.' });
  }
});

app.post('/save-record', (req, res) => {
  const { name, id, score } = req.body;

  if (!name || !id || typeof score !== 'number') {
    return res.status(400).json({ error: 'Datos incompletos.' });
  }

  let scores;
  try {
    scores = JSON.parse(fs.readFileSync(HIGH_SCORE_PATH, 'utf8'));
  } catch (err) {
    scores = { weekly_high_score: { name: "", id: "", score: 0, date: "" } };
  }

  if (score > scores.weekly_high_score.score) {
    scores.weekly_high_score = {
      name,
      id,
      score,
      date: new Date().toISOString()
    };

    fs.writeFileSync(HIGH_SCORE_PATH, JSON.stringify(scores, null, 2));
    return res.json({ message: 'Nuevo récord guardado.' });
  } else {
    return res.status(403).json({ error: 'El puntaje no es un nuevo récord.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ FlappySunny servido en http://localhost:${PORT}`);
});
