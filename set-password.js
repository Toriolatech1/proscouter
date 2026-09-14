// Usage: npm run set-password -- "yourPassword"
// Prints a bcrypt hash to paste into .env as ADMIN_PASSWORD_HASH.

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.log('\nUsage: npm run set-password -- "yourPassword"\n');
  process.exit(1);
}

if (password.length < 8) {
  console.log('\nUse at least 8 characters — this password protects your whole tool.\n');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\nAdd this line to your .env file:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
