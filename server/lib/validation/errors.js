class ValidationError extends Error {
  constructor(details, message = 'Request validation failed') {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.statusCode = 400;
    this.details = Array.isArray(details) ? details : [];
  }
}

function validationDetail(field, reason) {
  return { field, reason };
}

function validationErrorHandler(err, req, res, next) {
  if (!err || err.code !== 'VALIDATION_ERROR') {
    next(err);
    return;
  }

  res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: err.message || 'Request validation failed',
    details: err.details.map((detail) => ({
      field: detail.field || 'request',
      reason: detail.reason || 'Invalid value'
    }))
  });
}

module.exports = {
  ValidationError,
  validationDetail,
  validationErrorHandler
};
