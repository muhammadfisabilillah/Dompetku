const { execSync } = require('child_process');
require('dotenv').config();

module.exports = async () => {
  // Load .env.test if it exists
  try {
    require('dotenv').config({ path: '.env.test' });
  } catch (e) {
    // ignore
  }
  execSync('npm run migrate', { stdio: 'inherit' });
};