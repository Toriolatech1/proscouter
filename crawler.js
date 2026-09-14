const axios = require('axios');
const cheerio = require('cheerio');
const createLimiter = require('./limiter');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JUNK_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i;

// Common paths worth trying when the homepage doesn't have an email.
const EXTRA_PATHS = {
  contact: ['/contact', '/contact-us', '/pages/contact', '/about', '/pages/about-us'],
  privacy: ['/privacy-policy', '/privacy', '/pages/privacy-policy', '/policies/privacy-policy'],
  checkout: ['/checkout', '/terms', '/terms-of-service', '/pages/terms-of-service']
};

function normalizeUrl(raw) {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

function domainOf(rawUrl) {
  try {
    return new URL(normalizeUrl(rawUrl)).hostname.replace(/^www\./, '');
  } catch (e) {
    return rawUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function storeNameFromDomain(domain) {
  const base = domain.split('.')[0];
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 8000,
    maxRedirects: 5,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; ProScouterBot/1.0; +https://example.com/bot-info)'
    },
    validateStatus: (s) => s < 500
  });
  return typeof res.data === 'string' ? res.data : '';
}

function extractEmails(html) {
  const $ = cheerio.load(html);
  const found = new Set();

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const addr = href.replace(/^mailto:/i, '').split('?')[0].trim();
    if (addr) found.add(addr.toLowerCase());
  });

  const haystack = $.root().text() + ' ' + html;
  const matches = haystack.match(EMAIL_REGEX) || [];
  matches.forEach((m) => found.add(m.toLowerCase()));

  return [...found].filter((e) => !JUNK_EXTENSIONS.test(e));
}

async function crawlOne(rawUrl, options) {
  const domain = domainOf(rawUrl);
  const storeName = storeNameFromDomain(domain);
  const homepageUrl = normalizeUrl(rawUrl);

  const pagesToTry = [{ url: homepageUrl, label: 'Homepage' }];
  if (options.scanContact) {
    EXTRA_PATHS.contact.forEach((p) => pagesToTry.push({ url: `https://${domain}${p}`, label: 'Contact page' }));
  }
  if (options.scanPrivacy) {
    EXTRA_PATHS.privacy.forEach((p) => pagesToTry.push({ url: `https://${domain}${p}`, label: 'Privacy Policy' }));
  }
  if (options.scanCheckout) {
    EXTRA_PATHS.checkout.forEach((p) => pagesToTry.push({ url: `https://${domain}${p}`, label: 'Checkout / Terms' }));
  }

  for (const page of pagesToTry) {
    try {
      const html = await fetchHtml(page.url);
      const emails = extractEmails(html);
      if (emails.length) {
        return {
          website: rawUrl,
          storeName,
          email: emails[0],
          allEmails: emails,
          source: page.label,
          status: 'Found'
        };
      }
    } catch (e) {
      continue; // page missing / timed out / blocked — try the next candidate
    }
  }

  return { website: rawUrl, storeName, email: '', allEmails: [], source: '', status: 'Not found' };
}

async function runFinderJob(job, urls, options, store) {
  const limit = createLimiter(15); // 15 sites in flight at once — polite and fast
  let processed = 0;

  await Promise.all(
    urls.map((u) =>
      limit(async () => {
        let result;
        try {
          result = await crawlOne(u, options);
        } catch (e) {
          result = { website: u, storeName: '', email: '', allEmails: [], source: '', status: 'Not found' };
        }
        job.results.push(result);
        processed += 1;
        job.processed = processed;
        if (processed % 100 === 0 || processed === urls.length) store.persist(job);
      })
    )
  );

  job.status = 'done';
  store.persist(job);
}

module.exports = { runFinderJob, crawlOne, domainOf };
