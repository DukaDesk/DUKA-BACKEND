export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  timestamp: Date;
  data: Record<string, any>;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
}

export type DomainEventHandler = (event: DomainEvent) => Promise<void> | void;
