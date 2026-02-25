const config = require('../config');

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const colors = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[37m', reset: '\x1b[0m' };

function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const color = colors[level] || '';
  console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${colors.reset}`, ...args);
}

module.exports = {
  error: (...args) => log('error', ...args),
  warn: (...args) => log('warn', ...args),
  info: (...args) => log('info', ...args),
  debug: (...args) => config.NODE_ENV !== 'production' && log('debug', ...args),
};
