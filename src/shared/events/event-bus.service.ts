import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, DomainEventHandler } from './domain-event.interface';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private handlers = new Map<string, DomainEventHandler[]>();
  private asyncHandlers = new Map<string, DomainEventHandler[]>();

  register(eventType: string, handler: DomainEventHandler, async = false): void {
    const map = async ? this.asyncHandlers : this.handlers;
    const handlers = map.get(eventType) || [];
    handlers.push(handler);
    map.set(eventType, handlers);
  }

  async publish(event: Omit<DomainEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: DomainEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      ...event,
    };

    this.logger.debug(`Event published: ${fullEvent.type} [${fullEvent.id}]`);

    const syncHandlers = this.handlers.get(fullEvent.type) || [];
    for (const handler of syncHandlers) {
      try {
        await handler(fullEvent);
      } catch (err: unknown) {
        this.logger.error(`Sync handler failed for ${fullEvent.type}: ${(err as Error).message}`);
      }
    }

    const asyncList = this.asyncHandlers.get(fullEvent.type) || [];
    for (const handler of asyncList) {
      Promise.resolve(handler(fullEvent)).catch((err: unknown) => {
        this.logger.error(`Async handler failed for ${fullEvent.type}: ${(err as Error).message}`);
      });
    }
  }

  removeAll(): void {
    this.handlers.clear();
    this.asyncHandlers.clear();
  }
}
