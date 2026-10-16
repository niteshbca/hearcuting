export type ErrorDetail = { field?: string; message: string };

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetail[];
  readonly expose: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ErrorDetail[],
    expose = true
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errors = {
  badRequest: (message = 'Invalid request', details?: ErrorDetail[]) =>
    new AppError(400, 'BAD_REQUEST', message, details),
  validation: (details: ErrorDetail[], message = 'Validation failed') =>
    new AppError(422, 'VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication required') =>
    new AppError(401, 'UNAUTHORIZED', message),
  invalidCredentials: () =>
    new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
  sessionExpired: () =>
    new AppError(401, 'SESSION_EXPIRED', 'Session expired, please sign in again'),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message = 'Resource already exists', details?: ErrorDetail[]) =>
    new AppError(409, 'CONFLICT', message, details),
  slotTaken: (message = 'That time slot is no longer available') =>
    new AppError(409, 'SLOT_UNAVAILABLE', message),
  policyBlocked: (message: string) => new AppError(422, 'POLICY_VIOLATION', message),
  rateLimited: (message = 'Too many requests, please try again later') =>
    new AppError(429, 'RATE_LIMITED', message),
  payloadTooLarge: (message = 'File or payload too large') =>
    new AppError(413, 'PAYLOAD_TOO_LARGE', message),
  paymentError: (message = 'Payment processing failed') =>
    new AppError(402, 'PAYMENT_ERROR', message),
  internal: (message = 'Something went wrong. Please try again later.') =>
    new AppError(500, 'INTERNAL_ERROR', message, undefined, true),
};

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
