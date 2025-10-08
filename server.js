const fetch = require('node-fetch')
require('dotenv').config();

// server.js — simple Express backend
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'submissions.json');

const STATE_FILE = path.join(__dirname, 'state.json');
if (!fs.existsSync(STATE_FILE)) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ currentQuestion: 0 }, null, 2));
}
function getState() {
  return JSON.parse(fs.readFileSync(STATE_FILE));
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
function getCurrentQuestion() {
  return getState().currentQuestion;
}
function setCurrentQuestion(q) {
  const s = getState();
  s.currentQuestion = q;
  saveState(s);
}
function getCurrentFileIndex() {
  return getState().currentFileIndex;
}
function setCurrentFileIndex(i) {
  const s = getState();
  s.currentFileIndex = i;
  saveState(s);
}
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple password protection for tutor routes
const TUTOR_PASSWORD = process.env.TUTOR_PASSWORD;

app.use(['/tutor.html', '/api/submissions', '/api/progress-question', '/api/next-file'], (req, res, next) => {
  const auth = req.headers.authorization || '';
  const expected = 'Basic ' + Buffer.from('tutor:' + TUTOR_PASSWORD).toString('base64');
  if (auth === expected) return next();

  res.set('WWW-Authenticate', 'Basic realm="Tutor Area"');
  return res.status(401).send('Access denied');
});


// Ensure submissions file exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([] , null, 2));
}

// Get current question
app.get('/api/current-question', (req, res) => {
  res.json({ question: getCurrentQuestion() });
});

// API: Progress to next question
app.post('/api/progress-question', (req, res) => {
  const q = getCurrentQuestion() + 1;
  setCurrentQuestion(q);
  res.json({ ok: true, question: q });
});

// Get current file URL
app.get('/api/current-file', (req, res) => {
  const TUTOR_CODE_URLS_JSON = path.join(__dirname, 'tutorCodeUrls.json');
  const files =  JSON.parse(fs.readFileSync(TUTOR_CODE_URLS_JSON));
  const idx = getCurrentFileIndex();
  res.json({ url: files[idx] || '' });
});

// Tutor sets next file
app.post('/api/next-file', (req, res) => {
  const TUTOR_CODE_URLS_JSON = path.join(__dirname, 'tutorCodeUrls.json');
  const files =  JSON.parse(fs.readFileSync(TUTOR_CODE_URLS_JSON));
  let idx = getCurrentFileIndex();
  idx = (idx + 1) % files.length; // wrap around if needed
  setCurrentFileIndex(idx);
  res.json({ ok: true, index: idx, url: files[idx] });
});


// API: Save a submission
app.post('/api/submit', (req, res) => {
  try {
    const { studentName = 'anonymous', code = '', metadata = {} } = req.body;
    const submissions = JSON.parse(fs.readFileSync(DATA_FILE));
    const question = getCurrentQuestion();

    const newSub = {
      id: Date.now().toString(),
      studentName,
      code,
      question,
      metadata,
      timestamp: new Date().toISOString()
    };

    submissions.unshift(newSub);
    fs.writeFileSync(DATA_FILE, JSON.stringify(submissions, null, 2));
    res.json({ ok: true, submission: newSub });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});


// API: List submissions (tutor)
app.get('/api/submissions', (req, res) => {
  try {
    const submissions = JSON.parse(fs.readFileSync(DATA_FILE));
    res.json({ ok: true, submissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// API: Get single submission
app.get('/api/submissions/:id', (req, res) => {
  try {
    const id = req.params.id;
    const submissions = JSON.parse(fs.readFileSync(DATA_FILE));
    const sub = submissions.find(s => s.id === id);
    if (!sub) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, submission: sub });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get('/api/tutor-code-url', (req, res) => {
  res.json({ url: process.env.TUTOR_CODE_URL || '' });
});


app.get('/api/fetch-tutor', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url');
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    const text = await response.text();
    res.type('text/plain').send(text);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching tutor code: ' + err.message);
  }
});


// Fallback — static files served from /public
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));