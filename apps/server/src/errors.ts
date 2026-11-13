import { errorHttpStatus, type ErrorCode, type ErrorResponse } from '@northbook/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function publicError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError(
      'validation_failed',
      error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; '),
    );
  }
  if (error instanceof Error && 'statusCode' in error && error.statusCode === 400) {
    return new AppError('validation_failed', 'Invalid request.');
  }
  return new AppError('internal_error', 'An unexpected error occurred.');
}

export function sendError(error: AppError, request: FastifyRequest, reply: FastifyReply) {
  const body: ErrorResponse = {
    error: { code: error.code, message: error.message, requestId: request.id },
  };
  const status = errorHttpStatus[error.code];
  if (status >= 500) {
    request.log.error({ error: body.error }, 'Request failed');
  } else {
    request.log.warn({ error: body.error }, 'Request failed');
  }
  return reply.code(status).send(body);
}
