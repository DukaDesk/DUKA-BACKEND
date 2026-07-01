import { Injectable, Logger as NestLogger, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends NestLogger {
  private correlationId?: string;
  private tenantId?: string;
  private userId?: string;

  setContext(context: string): this {
    this.context = context;
    return this;
  }

  setCorrelationId(id: string): this {
    this.correlationId = id;
    return this;
  }

  setTenantId(id: string): this {
    this.tenantId = id;
    return this;
  }

  setUserId(id: string): this {
    this.userId = id;
    return this;
  }

  private formatMessage(message: string): string {
    const parts: string[] = [];
    if (this.correlationId) parts.push(`[cid:${this.correlationId}]`);
    if (this.tenantId) parts.push(`[tenant:${this.tenantId}]`);
    if (this.userId) parts.push(`[user:${this.userId}]`);
    parts.push(message);
    return parts.join(' ');
  }

  log(message: any, ...optionalParams: any[]) {
    super.log(this.formatMessage(message), ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    super.warn(this.formatMessage(message), ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    super.error(this.formatMessage(message), ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    super.debug(this.formatMessage(message), ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    super.verbose(this.formatMessage(message), ...optionalParams);
  }
}
