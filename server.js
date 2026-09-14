require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { requireAuth, checkPassword } = require('./lib/auth');
const store = require('./lib/store');
const { runFinderJob } = require('./lib/crawler');
const { runVerifyJob } = require('./lib/verify');
const { sendXlsx, sendCsv } = require('./lib/export');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 hour login
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// ---------------------------------------------------------------------
// Public routes — login only
// ---------------------------------------------------------------------
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', async (req, res) => {
  try {
    const ok = await checkPassword(req.body.password || '');
    if (!ok) return res.status(401).json({ ok: false, error: 'Wrong password' });
    req.session.authenticated = true;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---------------------------------------------------------------------
// Everything below this line requires a logged-in session
// ---------------------------------------------------------------------
// app.use(requireAuth);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// ---------------- Section 1: Email Finder ----------------
app.post('/api/finder/jobs', (req, res) => {
  const urls = Array.isArray(req.body.urls) ? req.body.urls.slice(0, 10000) : [];
  if (!urls.length) return res.status(400).json({ error: 'No URLs provided' });

  const options = {
    scanPrivacy: !!req.body.scanPrivacy,
    scanCheckout: !!req.body.scanCheckout,
    scanContact: !!req.body.scanContact
  };

  const job = store.createJob('finder', urls.length);
  job.status = 'running';
  store.persist(job);

  runFinderJob(job, urls, options, store).catch((err) => {
    job.status = 'error';
    job.error = err.message;
    store.persist(job);
  });

  res.json({ jobId: job.id });
});

app.get('/api/finder/jobs/:id', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const found = job.results.filter((r) => r.status === 'Found').length;
  res.json({
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    found,
    notFound: job.processed - found,
    error: job.error
  });
});

app.get('/api/finder/jobs/:id/results', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(200, parseInt(req.query.pageSize || '25', 10));
  const start = (page - 1) * pageSize;
  res.json({
    rows: job.results.slice(start, start + pageSize),
    total: job.results.length,
    page,
    pageSize
  });
});

app.get('/api/finder/jobs/:id/export.:ext', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const rows = job.results.map((r) => ({
    Website: r.website,
    'Store Name': r.storeName,
    Email: r.email || '—',
    Source: r.source || '—',
    Status: r.status
  }));
  if (req.params.ext === 'csv') return sendCsv(res, rows, 'proscouter_emails_found.csv');
  return sendXlsx(res, rows, 'Emails Found', 'proscouter_emails_found.xlsx');
});

// ---------------- Section 2: Verify & Reach ----------------
app.post('/api/verify/jobs', (req, res) => {
  const emails = Array.isArray(req.body.emails) ? req.body.emails.slice(0, 10000) : [];
  if (!emails.length) return res.status(400).json({ error: 'No emails provided' });

  const job = store.createJob('verify', emails.length);
  job.status = 'running';
  store.persist(job);

  runVerifyJob(job, emails, store).catch((err) => {
    job.status = 'error';
    job.error = err.message;
    store.persist(job);
  });

  res.json({ jobId: job.id });
});

app.get('/api/verify/jobs/:id', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const counts = { valid: 0, risky: 0, invalid: 0 };
  job.results.forEach((r) => counts[r.status]++);
  res.json({
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    counts,
    error: job.error
  });
});

app.get('/api/verify/jobs/:id/results', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(200, parseInt(req.query.pageSize || '25', 10));
  const filter = req.query.filter || 'all';
  const data = filter === 'all' ? job.results : job.results.filter((r) => r.status === filter);
  const start = (page - 1) * pageSize;
  res.json({ rows: data.slice(start, start + pageSize), total: data.length, page, pageSize });
});

app.get('/api/verify/jobs/:id/export.:ext', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const filter = req.query.filter || 'all';
  const data = filter === 'all' ? job.results : job.results.filter((r) => r.status === filter);
  const rows = data.map((r) => ({ Email: r.email, Status: r.status, Reason: r.reason, Domain: r.domain }));
  if (req.params.ext === 'csv') return sendCsv(res, rows, 'proscouter_verified_list.csv');
  return sendXlsx(res, rows, 'Verified List', 'proscouter_verified_list.xlsx');
});

// Static dashboard assets (protected — sits below requireAuth)
app.use('/', express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`ProScouter running on http://localhost:${PORT}`);
});
