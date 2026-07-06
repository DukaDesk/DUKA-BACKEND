import { Injectable } from '@nestjs/common';

export interface ComponentPropSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'color' | 'image' | 'array' | 'object' | 'select';
  label: string;
  required?: boolean;
  defaultValue?: any;
  options?: { label: string; value: string }[];
  validation?: { min?: number; max?: number; pattern?: string };
}

export interface ComponentDefinition {
  type: string;
  label: string;
  category: 'layout' | 'content' | 'media' | 'commerce' | 'forms' | 'interactive';
  icon: string;
  props: ComponentPropSchema[];
  supportsActions: boolean;
  supportsConditional: boolean;
  supportsBinding: boolean;
  allowedChildren?: string[];
  maxChildren?: number;
}

@Injectable()
export class ComponentRegistryService {
  private registry = new Map<string, ComponentDefinition>();

  constructor() {
    this.registerDefaults();
  }

  register(definition: ComponentDefinition): void {
    this.registry.set(definition.type, definition);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.registry.get(type);
  }

  getAll(): ComponentDefinition[] {
    return Array.from(this.registry.values());
  }

  getByCategory(category: string): ComponentDefinition[] {
    return this.getAll().filter((c) => c.category === category);
  }

  validate(type: string, props: Record<string, any>): { valid: boolean; errors: string[] } {
    const def = this.registry.get(type);
    if (!def) return { valid: false, errors: [`Unknown component type: ${type}`] };

    const errors: string[] = [];

    for (const prop of def.props) {
      if (prop.required && (props[prop.name] === undefined || props[prop.name] === null)) {
        errors.push(`Missing required prop: ${prop.name}`);
      }

      const value = props[prop.name];
      if (value !== undefined && value !== null) {
        if (prop.validation) {
          if (prop.validation.min !== undefined && typeof value === 'number' && value < prop.validation.min) {
            errors.push(`${prop.name} must be >= ${prop.validation.min}`);
          }
          if (prop.validation.max !== undefined && typeof value === 'number' && value > prop.validation.max) {
            errors.push(`${prop.name} must be <= ${prop.validation.max}`);
          }
          if (prop.validation.pattern && typeof value === 'string' && !new RegExp(prop.validation.pattern).test(value)) {
            errors.push(`${prop.name} does not match required pattern`);
          }
        }

        if (prop.type === 'select' && prop.options) {
          if (!prop.options.some((o) => o.value === value)) {
            errors.push(`${prop.name} must be one of: ${prop.options.map((o) => o.value).join(', ')}`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private registerDefaults(): void {
    this.register({
      type: 'header',
      label: 'Header',
      category: 'layout',
      icon: 'header',
      props: [
        { name: 'title', type: 'string', label: 'Title', required: true },
        { name: 'subtitle', type: 'string', label: 'Subtitle' },
        { name: 'alignment', type: 'select', label: 'Alignment', defaultValue: 'left', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }] },
        { name: 'textColor', type: 'color', label: 'Text Color' },
      ],
      supportsActions: false,
      supportsConditional: true,
      supportsBinding: true,
    });

    this.register({
      type: 'text_block',
      label: 'Text Block',
      category: 'content',
      icon: 'text',
      props: [
        { name: 'content', type: 'string', label: 'Content', required: true },
        { name: 'fontSize', type: 'select', label: 'Font Size', defaultValue: 'body', options: [{ label: 'Small', value: 'small' }, { label: 'Body', value: 'body' }, { label: 'Large', value: 'large' }] },
        { name: 'textColor', type: 'color', label: 'Text Color' },
      ],
      supportsActions: false,
      supportsConditional: true,
      supportsBinding: true,
    });

    this.register({
      type: 'image',
      label: 'Image',
      category: 'media',
      icon: 'image',
      props: [
        { name: 'src', type: 'string', label: 'Image URL', required: true },
        { name: 'alt', type: 'string', label: 'Alt Text' },
        { name: 'aspectRatio', type: 'select', label: 'Aspect Ratio', defaultValue: '16:9', options: [{ label: '1:1', value: '1:1' }, { label: '4:3', value: '4:3' }, { label: '16:9', value: '16:9' }, { label: '3:2', value: '3:2' }] },
        { name: 'borderRadius', type: 'string', label: 'Border Radius' },
      ],
      supportsActions: false,
      supportsConditional: true,
      supportsBinding: true,
    });

    this.register({
      type: 'button',
      label: 'Button',
      category: 'interactive',
      icon: 'button',
      props: [
        { name: 'label', type: 'string', label: 'Label', required: true },
        { name: 'variant', type: 'select', label: 'Variant', defaultValue: 'primary', options: [{ label: 'Primary', value: 'primary' }, { label: 'Secondary', value: 'secondary' }, { label: 'Outline', value: 'outline' }, { label: 'Ghost', value: 'ghost' }] },
        { name: 'fullWidth', type: 'boolean', label: 'Full Width', defaultValue: false },
        { name: 'size', type: 'select', label: 'Size', defaultValue: 'md', options: [{ label: 'Small', value: 'sm' }, { label: 'Medium', value: 'md' }, { label: 'Large', value: 'lg' }] },
      ],
      supportsActions: true,
      supportsConditional: true,
      supportsBinding: true,
    });

    this.register({
      type: 'product_grid',
      label: 'Product Grid',
      category: 'commerce',
      icon: 'grid',
      props: [
        { name: 'title', type: 'string', label: 'Section Title' },
        { name: 'categoryId', type: 'string', label: 'Category Filter' },
        { name: 'limit', type: 'number', label: 'Max Products', defaultValue: 8, validation: { min: 1, max: 50 } },
        { name: 'columns', type: 'select', label: 'Columns', defaultValue: '2', options: [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }] },
        { name: 'sortBy', type: 'select', label: 'Sort By', defaultValue: 'createdAt', options: [{ label: 'Newest', value: 'createdAt' }, { label: 'Price Low', value: 'price_asc' }, { label: 'Price High', value: 'price_desc' }, { label: 'Name', value: 'name' }] },
      ],
      supportsActions: true,
      supportsConditional: false,
      supportsBinding: true,
    });

    this.register({
      type: 'service_list',
      label: 'Service List',
      category: 'commerce',
      icon: 'list',
      props: [
        { name: 'title', type: 'string', label: 'Section Title' },
        { name: 'categoryId', type: 'string', label: 'Category Filter' },
        { name: 'limit', type: 'number', label: 'Max Services', defaultValue: 10, validation: { min: 1, max: 100 } },
      ],
      supportsActions: true,
      supportsConditional: false,
      supportsBinding: true,
    });

    this.register({
      type: 'form',
      label: 'Form Embed',
      category: 'forms',
      icon: 'form',
      props: [
        { name: 'formId', type: 'string', label: 'Form ID', required: true },
        { name: 'submitLabel', type: 'string', label: 'Submit Button Label', defaultValue: 'Submit' },
      ],
      supportsActions: true,
      supportsConditional: false,
      supportsBinding: false,
    });

    this.register({
      type: 'divider',
      label: 'Divider',
      category: 'layout',
      icon: 'divider',
      props: [
        { name: 'color', type: 'color', label: 'Color' },
        { name: 'thickness', type: 'number', label: 'Thickness', defaultValue: 1, validation: { min: 1, max: 10 } },
        { name: 'spacing', type: 'number', label: 'Spacing', defaultValue: 16, validation: { min: 0, max: 100 } },
      ],
      supportsActions: false,
      supportsConditional: false,
      supportsBinding: false,
    });

    this.register({
      type: 'spacer',
      label: 'Spacer',
      category: 'layout',
      icon: 'spacer',
      props: [
        { name: 'height', type: 'number', label: 'Height', required: true, defaultValue: 16, validation: { min: 4, max: 200 } },
      ],
      supportsActions: false,
      supportsConditional: false,
      supportsBinding: false,
    });

    this.register({
      type: 'carousel',
      label: 'Image Carousel',
      category: 'media',
      icon: 'carousel',
      props: [
        { name: 'images', type: 'array', label: 'Images', required: true },
        { name: 'autoPlay', type: 'boolean', label: 'Auto-Play', defaultValue: true },
        { name: 'interval', type: 'number', label: 'Interval (ms)', defaultValue: 3000, validation: { min: 1000, max: 10000 } },
        { name: 'showDots', type: 'boolean', label: 'Show Dots', defaultValue: true },
      ],
      supportsActions: true,
      supportsConditional: false,
      supportsBinding: true,
    });

    this.register({
      type: 'map',
      label: 'Map',
      category: 'interactive',
      icon: 'map',
      props: [
        { name: 'latitude', type: 'number', label: 'Latitude', required: true },
        { name: 'longitude', type: 'number', label: 'Longitude', required: true },
        { name: 'zoom', type: 'number', label: 'Zoom Level', defaultValue: 15, validation: { min: 1, max: 20 } },
        { name: 'markerTitle', type: 'string', label: 'Marker Title' },
      ],
      supportsActions: true,
      supportsConditional: false,
      supportsBinding: true,
    });
  }
}
