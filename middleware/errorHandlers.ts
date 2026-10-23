import type { Request, Response, NextFunction } from 'express';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Not Found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(
  err: Error & { status?: number; statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? err.statusCode ?? 500;

  if (status >= 500) {
    console.error('[error]', err);
  }

  const exposeMessage = status < 500 || process.env.NODE_ENV !== 'production';
  res.status(status).json({
    error: exposeMessage ? err.message || 'Internal Server Error' : 'Internal Server Error',
  });
}
