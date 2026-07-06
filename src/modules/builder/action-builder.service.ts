import { Injectable, Logger } from '@nestjs/common';

export interface ActionDefinition {
  type: string;
  label: string;
  params: ActionParam[];
  description: string;
}

export interface ActionParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json';
  label: string;
  required?: boolean;
  defaultValue?: any;
  options?: { label: string; value: string }[];
}

export interface ActionConfig {
  type: string;
  params: Record<string, any>;
  fallback?: ActionConfig;
}

export interface ActionExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

@Injectable()
export class ActionBuilderService {
  private readonly logger = new Logger(ActionBuilderService.name);
  private registry = new Map<string, ActionDefinition>();

  constructor() {
    this.registerDefaults();
  }

  register(actionDef: ActionDefinition): void {
    this.registry.set(actionDef.type, actionDef);
  }

  get(type: string): ActionDefinition | undefined {
    return this.registry.get(type);
  }

  getAll(): ActionDefinition[] {
    return Array.from(this.registry.values());
  }

  validate(config: ActionConfig): { valid: boolean; errors: string[] } {
    const def = this.registry.get(config.type);
    if (!def) return { valid: false, errors: [`Unknown action type: ${config.type}`] };

    const errors: string[] = [];
    for (const param of def.params) {
      if (param.required && (config.params[param.name] === undefined || config.params[param.name] === null)) {
        errors.push(`Missing required param: ${param.name}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(config: ActionConfig, context: Record<string, any>): Promise<ActionExecutionResult> {
    const def = this.registry.get(config.type);
    if (!def) {
      if (config.fallback) return this.execute(config.fallback, context);
      return { success: false, error: `Unknown action: ${config.type}` };
    }

    try {
      const resolvedParams = this.resolveParams(config.params, context);

      switch (config.type) {
        case 'navigate':
          return this.execNavigate(resolvedParams);
        case 'open_url':
          return this.execOpenUrl(resolvedParams);
        case 'api_call':
          return this.execApiCall(resolvedParams, context);
        case 'call_phone':
          return this.execCallPhone(resolvedParams);
        case 'send_email':
          return this.execSendEmail(resolvedParams);
        case 'share':
          return this.execShare(resolvedParams);
        case 'add_to_cart':
          return { success: true, data: { action: 'add_to_cart', params: resolvedParams } };
        case 'book_service':
          return { success: true, data: { action: 'book_service', params: resolvedParams } };
        case 'open_form':
          return { success: true, data: { action: 'open_form', params: resolvedParams } };
        case 'scroll_to':
          return { success: true, data: { action: 'scroll_to', params: resolvedParams } };
        default:
          return { success: true, data: { action: config.type, params: resolvedParams } };
      }
    } catch (err: any) {
      this.logger.error(`Action execution failed: ${err.message}`);
      if (config.fallback) return this.execute(config.fallback, context);
      return { success: false, error: err.message };
    }
  }

  private resolveParams(params: Record<string, any>, context: Record<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const path = value.slice(2, -2).trim();
        resolved[key] = this.resolvePath(context, path);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  private resolvePath(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => (current ? current[key] : undefined), obj);
  }

  private execNavigate(params: Record<string, any>): ActionExecutionResult {
    return { success: true, data: { type: 'navigate', screen: params.screen, params: params.params } };
  }

  private execOpenUrl(params: Record<string, any>): ActionExecutionResult {
    return { success: true, data: { type: 'open_url', url: params.url, external: params.external ?? true } };
  }

  private async execApiCall(params: Record<string, any>, _context: Record<string, any>): Promise<ActionExecutionResult> {
    const { url, method = 'GET', body } = params;
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      return { success: response.ok, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private execCallPhone(params: Record<string, any>): ActionExecutionResult {
    return { success: true, data: { type: 'call_phone', number: params.number } };
  }

  private execSendEmail(params: Record<string, any>): ActionExecutionResult {
    return { success: true, data: { type: 'send_email', to: params.to, subject: params.subject, body: params.body } };
  }

  private execShare(params: Record<string, any>): ActionExecutionResult {
    return { success: true, data: { type: 'share', title: params.title, url: params.url, message: params.message } };
  }

  private registerDefaults(): void {
    this.register({
      type: 'navigate',
      label: 'Navigate to Screen',
      description: 'Navigate to another screen within the app',
      params: [
        { name: 'screen', type: 'string', label: 'Screen Slug', required: true },
        { name: 'params', type: 'json', label: 'Navigation Params' },
      ],
    });

    this.register({
      type: 'open_url',
      label: 'Open URL',
      description: 'Open a URL in the browser or in-app browser',
      params: [
        { name: 'url', type: 'string', label: 'URL', required: true },
        { name: 'external', type: 'boolean', label: 'Open Externally', defaultValue: true },
      ],
    });

    this.register({
      type: 'api_call',
      label: 'API Call',
      description: 'Make an HTTP request to an external API',
      params: [
        { name: 'url', type: 'string', label: 'API URL', required: true },
        { name: 'method', type: 'select', label: 'HTTP Method', defaultValue: 'GET', options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }, { label: 'PUT', value: 'PUT' }, { label: 'DELETE', value: 'DELETE' }] },
        { name: 'body', type: 'json', label: 'Request Body' },
      ],
    });

    this.register({
      type: 'call_phone',
      label: 'Call Phone',
      description: 'Initiate a phone call',
      params: [
        { name: 'number', type: 'string', label: 'Phone Number', required: true },
      ],
    });

    this.register({
      type: 'send_email',
      label: 'Send Email',
      description: 'Open email client with pre-filled message',
      params: [
        { name: 'to', type: 'string', label: 'Recipient Email', required: true },
        { name: 'subject', type: 'string', label: 'Subject' },
        { name: 'body', type: 'string', label: 'Body' },
      ],
    });

    this.register({
      type: 'share',
      label: 'Share',
      description: 'Open system share dialog',
      params: [
        { name: 'title', type: 'string', label: 'Title' },
        { name: 'url', type: 'string', label: 'URL' },
        { name: 'message', type: 'string', label: 'Message' },
      ],
    });

    this.register({
      type: 'add_to_cart',
      label: 'Add to Cart',
      description: 'Add a product to the shopping cart',
      params: [
        { name: 'productId', type: 'string', label: 'Product ID', required: true },
        { name: 'variantId', type: 'string', label: 'Variant ID' },
        { name: 'quantity', type: 'number', label: 'Quantity', defaultValue: 1 },
      ],
    });

    this.register({
      type: 'book_service',
      label: 'Book Service',
      description: 'Navigate to booking flow for a service',
      params: [
        { name: 'serviceId', type: 'string', label: 'Service ID', required: true },
        { name: 'staffId', type: 'string', label: 'Staff ID' },
      ],
    });

    this.register({
      type: 'open_form',
      label: 'Open Form',
      description: 'Open a form for submission',
      params: [
        { name: 'formId', type: 'string', label: 'Form ID', required: true },
      ],
    });

    this.register({
      type: 'scroll_to',
      label: 'Scroll To',
      description: 'Scroll to a specific element on the page',
      params: [
        { name: 'elementId', type: 'string', label: 'Element ID', required: true },
        { name: 'offset', type: 'number', label: 'Scroll Offset' },
      ],
    });
  }
}
