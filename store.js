const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data', 'jobs');
fs.mkdirSync(DATA_DIR, { recursive: true });

const jobs = new Map();

function createJob(type, total) {
  const job = {
    id: crypto.randomUUID(),
    type,
    status: 'queued',
    total,
    processed: 0,
    results: [],
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  jobs.set(job.id, job);
  persist(job);
  return job;
}

function getJob(id) {
  return jobs.get(id);
}

function persist(job) {
  job.updatedAt = Date.now();
  try {
    fs.writeFileSync(path.join(DATA_DIR, `${job.id}.json`), JSON.stringify(job));
  } catch (e) {
    console.error('Failed to persist job', job.id, e.message);
  }
}

function loadFromDisk() {
  let files = [];
  try {
    files = fs.readdirSync(DATA_DIR);
  } catch (e) {
    return;
  }
  for (const file of files) {
    try {
      const job = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      jobs.set(job.id, job);
    } catch (e) {
      // skip corrupt file
    }
  }
}

// Drop jobs (and their files) older than 7 days so disk usage doesn't grow forever.
function pruneOldJobs(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, job] of jobs) {
    if (job.updatedAt < cutoff) {
      jobs.delete(id);
      try { fs.unlinkSync(path.join(DATA_DIR, `${id}.json`)); } catch (e) {}
    }
  }
}

loadFromDisk();
pruneOldJobs();

module.exports = { createJob, getJob, persist, jobs };
