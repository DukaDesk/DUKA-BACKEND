import { Injectable } from '@nestjs/common';

export interface Condition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_contains' | 'empty' | 'not_empty' | 'in' | 'not_in';
  value: any;
}

export interface ConditionGroup {
  logic: 'AND' | 'OR';
  conditions: (Condition | ConditionGroup)[];
}

@Injectable()
export class ConditionalEngineService {
  evaluate(group: ConditionGroup, context: Record<string, any>): boolean {
    return this.evaluateGroup(group, context);
  }

  private evaluateGroup(group: ConditionGroup, context: Record<string, any>): boolean {
    const results = group.conditions.map((cond) => {
      if ('logic' in cond && 'conditions' in cond) {
        return this.evaluateGroup(cond as ConditionGroup, context);
      }
      return this.evaluateCondition(cond as Condition, context);
    });

    return group.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  }

  private evaluateCondition(condition: Condition, context: Record<string, any>): boolean {
    const actualValue = this.resolvePath(context, condition.field);

    switch (condition.operator) {
      case 'equals':
        return actualValue === condition.value;
      case 'not_equals':
        return actualValue !== condition.value;
      case 'greater_than':
        return Number(actualValue) > Number(condition.value);
      case 'less_than':
        return Number(actualValue) < Number(condition.value);
      case 'contains':
        return String(actualValue).includes(String(condition.value));
      case 'not_contains':
        return !String(actualValue).includes(String(condition.value));
      case 'empty':
        return actualValue === undefined || actualValue === null || actualValue === '';
      case 'not_empty':
        return actualValue !== undefined && actualValue !== null && actualValue !== '';
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(actualValue);
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(actualValue);
      default:
        return true;
    }
  }

  private resolvePath(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => (current ? current[key] : undefined), obj);
  }
}
