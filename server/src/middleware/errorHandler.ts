import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { MongoServerError } from 'mongodb';
import { ZodError } from 'zod';
import { env, isProd } from '../config/env';
import { logger } from '../config/logger';
import { AppError, isAppError } from '../utils/errors';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let appErr = toAppError(err);

  if (!(err instanceof AppError) || appErr.status >= 500) {
    logger.error({ err, req: { method: req.method, path: req.path } }, 'request error');
  } else {
    logger.warn(
      { code: appErr.code, status: appErr.status, path: req.path, message: appErr.message },
      'handled request error'
    );
  }

  const body: Record<string, unknown> = {
    error: {
      code: appErr.code,
      message: appErr.expose ? appErr.message : 'Something went wrong. Please try again later.',
    },
  };
  if (appErr.details?.length) (body.error as Record<string, unknown>).details = appErr.details;
  if (!isProd() && appErr.status >= 500 && err instanceof Error) {
    (body.error as Record<string, unknown>).debug = err.message;
  }
  res.status(appErr.status).json(body);
}

function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;

  if (err instanceof ZodError) {
    return new AppError(
      422,
      'VALIDATION_ERROR',
      'Validation failed',
      err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
    );
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return new AppError(
      422,
      'VALIDATION_ERROR',
      'Validation failed',
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }))
    );
  }

  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, 'BAD_REQUEST', `Invalid value for ${err.path}`);
  }

  if (err instanceof MongoServerError && err.code === 11000) {
    const fields = Object.keys(err.keyPattern ?? {});
    return new AppError(
      409,
      'DUPLICATE_KEY',
      `A record with this ${fields.join(', ') || 'value'} already exists`
    );
  }

  if (err instanceof Error && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')) {
    return new AppError(401, 'SESSION_EXPIRED', 'Session expired, please sign in again');
  }

  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return new AppError(400, 'BAD_REQUEST', 'Malformed JSON body');
  }

  const status =
    typeof (err as { status?: number })?.status === 'number'
      ? (err as { status: number }).status
      : 500;
  const message =
    status >= 500 && isProd() ? 'Something went wrong. Please try again later.' : (err as Error)?.message;
  return new AppError(status, 'INTERNAL_ERROR', message || 'Something went wrong', undefined, true);
}

export { env };
