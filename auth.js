const bcrypt = require('bcryptjs');

// Blocks any request that hasn't logged in. API calls get a 401 JSON response;
// page loads get redirected to the login form.
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login');
}

async function checkPassword(plainTextPassword) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || hash === 'replace-me') {
    throw new Error('ADMIN_PASSWORD_HASH is not set — run "npm run set-password" first');
  }
  return bcrypt.compare(plainTextPassword, hash);
}

module.exports = { requireAuth, checkPassword };
