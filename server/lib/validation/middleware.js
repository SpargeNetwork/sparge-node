const { ValidationError } = require('./errors');

function runValidation(schema, value) {
  const result = schema(value);
  if (!result || result.ok !== true) {
    throw new ValidationError(result?.details || [{ field: 'request', reason: 'Invalid request' }]);
  }
  return result.value;
}

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = runValidation(schema, req.body || {});
      next();
    } catch (err) {
      next(err);
    }
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = runValidation(schema, req.params || {});
      next();
    } catch (err) {
      next(err);
    }
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = runValidation(schema, req.query || {});
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
  runValidation
};
