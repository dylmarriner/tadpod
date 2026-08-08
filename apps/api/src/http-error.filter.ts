import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@tadpods/database';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'The request could not be completed';

    if (exception instanceof ZodError) {
      statusCode = HttpStatus.BAD_REQUEST;
      error = 'Validation Error';
      message = exception.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ');
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Thrown when a request supplies a value Prisma's query engine rejects before it ever
      // reaches the database — most commonly a malformed id (e.g. a non-UUID string) in a
      // `:id` route param. Without this, it falls through to a 500 for what is really a bad
      // request; every route that does `findUnique({ where: { id } })` on a raw path param
      // benefits from this without each one needing its own UUID-format check.
      statusCode = HttpStatus.BAD_REQUEST;
      error = 'Validation Error';
      message = 'The request contains a malformed identifier or value';
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      error = exception.name.replace(/Exception$/, '') || 'Request Error';
      const payload = exception.getResponse();
      message = typeof payload === 'string' ? payload : typeof payload === 'object' && payload !== null && 'message' in payload
        ? Array.isArray(payload.message) ? payload.message.join('; ') : String(payload.message)
        : exception.message;
    }

    response.status(statusCode).send({ statusCode, error, message, requestId: request.id });
  }
}
