import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errors: string[] = ['Internal server error'];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        errors = [exResponse];
      } else if (typeof exResponse === 'object') {
        const resp = exResponse as any;
        errors = resp.message
          ? Array.isArray(resp.message)
            ? resp.message
            : [resp.message]
          : [exception.message];
      }
    } else if (exception instanceof Error) {
      errors = [exception.message];
    }

    response.status(status).json({
      success: false,
      errors,
    });
  }
}
