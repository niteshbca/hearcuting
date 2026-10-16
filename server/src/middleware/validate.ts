import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AnyZodObject, ZodEffects, ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors';

type Schema = ZodTypeAny | AnyZodObject | ZodEffects<any, any, any>;

interface Schemas {
  body?: Schema;
  query?: Schema;
  params?: Schema;
  headers?: Schema;
}

/**
 * Validates req.body / req.query / req.params with Zod and REPLACES them
 * with the parsed (whitelisted, coerced) values — never trust raw input.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function parseOrThrow<T>(schema: Schema, value: unknown, where = 'body'): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Validation failed',
      result.error.errors.map((e) => ({ field: `${where}.${e.path.join('.')}`, message: e.message }))
    );
  }
  return result.data as T;
}
