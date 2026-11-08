const { HttpError } = require('../utils/errors');

function notFound(_req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Resource not found'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
  }
  // PostgreSQL class 22 = data exception (out-of-range number, invalid text, bad date ...): the client sent bad input.
  if (typeof err.code === 'string' && err.code.startsWith('22')) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'One of the submitted values is invalid' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

module.exports = { notFound, errorHandler };
