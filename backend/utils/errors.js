class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// PostgreSQL unique_violation
const isDuplicate = (err) => !!err && err.code === '23505';

module.exports = { HttpError, isDuplicate };
