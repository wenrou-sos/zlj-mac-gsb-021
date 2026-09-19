export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg) => new HttpError(400, 'bad_request', msg);
export const notFound = (msg) => new HttpError(404, 'not_found', msg);
export const conflict = (code, msg) => new HttpError(409, code, msg);

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  // Unique violation etc. from PostgreSQL.
  if (err.code === '23505') {
    return res
      .status(409)
      .json({ error: { code: 'duplicate', message: err.detail || '记录已存在' } });
  }
  if (err.code === '23503') {
    return res.status(409).json({ error: { code: 'fk_violation', message: '关联记录不存在' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: '服务器内部错误' } });
}
