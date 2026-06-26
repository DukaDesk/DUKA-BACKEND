import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SuccessResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: any;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        if (result && typeof result === 'object' && 'success' in result) {
          return result;
        }
        if (result && typeof result === 'object' && 'data' in result && 'meta' in result) {
          return {
            success: true,
            message: result.message || 'OK',
            data: result.data,
            meta: result.meta,
          };
        }
        return {
          success: true,
          message: 'OK',
          data: result ?? null,
        };
      }),
    );
  }
}
