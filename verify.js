const dns = require('dns').promises;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'guerrillamail.com', 'tempmail.com',
  'yopmail.com', 'trashmail.com', 'fakeinbox.com', 'sharklasers.com',
  'dispostable.com', 'getnada.com', 'maildrop.cc'
]);

const ROLE_PREFIXES = new Set([
  'admin', 'noreply', 'no-reply', 'postmaster', 'webmaster', 'abuse', 'root'
]);

// MX lookups are the slow part — cache per domain so a list with many
// addresses on the same store domain only pays the DNS cost once.
const mxCache = new Map();
async function hasMx(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok = false;
  try {
    const records = await dns.resolveMx(domain);
    ok = Array.isArray(records) && records.length > 0;
  } catch (e) {
    ok = false;
  }
  mxCache.set(domain, ok);
  return ok;
}

async function classifyEmail(raw, seen) {
  const email = raw.trim();
  const key = email.toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    return { email, status: 'invalid', reason: 'Invalid syntax', domain: '' };
  }

  const domain = key.split('@')[1];

  if (seen.has(key)) {
    return { email, status: 'invalid', reason: 'Duplicate in list', domain };
  }
  seen.add(key);

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { email, status: 'invalid', reason: 'Disposable / throwaway domain', domain };
  }

  const mx = await hasMx(domain);
  if (!mx) {
    return { email, status: 'invalid', reason: 'Domain has no mail server (no MX record)', domain };
  }

  const prefix = key.split('@')[0];
  if (ROLE_PREFIXES.has(prefix)) {
    return { email, status: 'risky', reason: 'Role-based address — low reply rate', domain };
  }

  // A real "does this exact mailbox exist" SMTP RCPT probe is deliberately
  // NOT done here — most cloud providers block outbound port 25, and many
  // mail servers greylist or silently accept-then-bounce, which produces
  // more false results than it's worth. Wire in ZeroBounce / NeverBounce /
  // Kickbox here if you need mailbox-level confidence (see README).
  return { email, status: 'valid', reason: 'Syntax OK, domain accepts mail (MX confirmed)', domain };
}

async function runVerifyJob(job, emails, store) {
  const seen = new Set();
  const CHUNK = 25;

  for (let i = 0; i < emails.length; i += CHUNK) {
    const chunk = emails.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map((e) => classifyEmail(e, seen)));
    job.results.push(...results);
    job.processed += chunk.length;
    store.persist(job);
  }

  job.status = 'done';
  store.persist(job);
}

module.exports = { runVerifyJob, classifyEmail };
