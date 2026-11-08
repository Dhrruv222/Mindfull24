const { HttpError } = require('./errors');

const MAX_ID = 2147483647; // PostgreSQL INT range
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length <= 255 && EMAIL_RE.test(trimmed);
}

// At least 8 characters with a letter and a digit.
function validatePassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && password.length <= 72
    && /[A-Za-z]/.test(password)
    && /\d/.test(password);
}

function validateName(name) {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 60;
}

function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > MAX_ID) throw new HttpError(400, 'INVALID_ID', `Invalid ${label}`);
  return n;
}

function requireString(value, label, { min = 1, max = 255 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${label} must be between ${min} and ${max} characters`);
  }
  return value.trim();
}

module.exports = { MAX_ID, validateEmail, validatePassword, validateName, parseId, requireString };
