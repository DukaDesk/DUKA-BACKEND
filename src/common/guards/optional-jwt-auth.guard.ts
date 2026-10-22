import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT that never rejects: a valid token authenticates the request
 * (request.user set), a missing/invalid token simply stays anonymous.
 * Pair with @CurrentUser('id') which tolerates undefined.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    return err ? null : (user ?? null);
  }
}
