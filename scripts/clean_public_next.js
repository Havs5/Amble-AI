/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function rmIfExists(p) {
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log(`[clean] removed ${p}`);
    }
  } catch (e) {
    console.warn(`[clean] failed to remove ${p}:`, e?.message || e);
  }
}

rmIfExists(path.join(process.cwd(), 'public', '_next'));
