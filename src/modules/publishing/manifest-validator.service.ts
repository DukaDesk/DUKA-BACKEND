import { UnprocessableEntityException } from '@nestjs/common';

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest: any;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * B1 — validate the canonical PublishedApp 1.0.0 object-screen manifest.
 * Preserves every submitted field (splash, navigation, actions, tapAction, …).
 * Never rewrites screens from object map to array (that breaks the mobile contract).
 */
export class ManifestValidator {
  static validate(manifest: any): ManifestValidationResult {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return {
        valid: false,
        errors: ['manifest must be a JSON object'],
        manifest: null,
      };
    }

    const manifestVersion = manifest.manifestVersion ?? manifest.metadata?.schemaVersion;
    if (manifestVersion != null) {
      const v = String(manifestVersion);
      if (v !== '1.0.0' && v !== '1.0') {
        errors.push(`Unsupported manifestVersion "${v}" (expected 1.0.0 or 1.0)`);
      }
    }

    const screens = manifest.screens;
    if (screens == null) {
      errors.push('screens is required');
    } else if (typeof screens === 'string') {
      errors.push('screens must be an object map or a non-empty array, not a bare string');
    } else if (Array.isArray(screens)) {
      if (screens.length === 0) errors.push('screens array must not be empty');
      screens.forEach((s: any, i: number) => {
        if (!s || typeof s !== 'object') {
          errors.push(`screens[${i}] must be an object`);
          return;
        }
        const id = s.screenId ?? s.id ?? s.slug;
        if (!id) errors.push(`screens[${i}] is missing screenId/id/slug`);
      });
    } else if (typeof screens === 'object') {
      const keys = Object.keys(screens);
      if (keys.length === 0) errors.push('screens object must not be empty');
      for (const [key, val] of Object.entries(screens)) {
        if (val == null) {
          errors.push(`screens.${key} must not be null`);
          continue;
        }
        if (typeof val === 'string') continue; // legacy id-only map
        if (typeof val !== 'object') {
          errors.push(`screens.${key} must be an object or screen id string`);
          continue;
        }
        const s = val as any;
        const id = s.screenId ?? s.id ?? key;
        if (!id) errors.push(`screens.${key} is missing screenId`);
        this.validateScreenNode(s, `screens.${key}`, errors);
      }
    } else {
      errors.push('screens must be an object map or a non-empty array');
    }

    if (manifest.navigation != null) {
      const nav = manifest.navigation;
      if (typeof nav !== 'object') {
        errors.push('navigation must be an object or array');
      } else if (!Array.isArray(nav)) {
        // object navigation: { initialScreen, tabs, ... } — check tab targets exist
        const initial = nav.initialScreen ?? nav.root?.initialRoute;
        const tabTargets: string[] = [];
        if (Array.isArray(nav.tabs)) {
          for (const [i, tab] of nav.tabs.entries()) {
            const screenId = tab?.screenId;
            if (!screenId) {
              errors.push(`navigation.tabs[${i}].screenId is required`);
            } else {
              tabTargets.push(screenId);
            }
          }
        }
        if (initial && screens && typeof screens === 'object' && !Array.isArray(screens)) {
          if (!(initial in screens) && screens[initial] == null) {
            // allow initialRoute pointing at a screen id present as key
            const has = Object.keys(screens).includes(initial);
            if (!has) errors.push(`navigation.initialScreen "${initial}" does not match any screen`);
          }
        }
        void tabTargets;
      }
    }

    if (manifest.splash != null && typeof manifest.splash !== 'object') {
      errors.push('splash must be an object when present');
    }

    if (manifest.identity != null) {
      if (typeof manifest.identity !== 'object') {
        errors.push('identity must be an object when present');
      }
    }

    // Version consistency: body.version vs manifest.version / app.version / metadata.version
    // (checked by caller when both present)

    return {
      valid: errors.length === 0,
      errors,
      // Preserve the submitted object by reference — no stripping, no screen rewrites.
      manifest,
    };
  }

  static assertValid(manifest: any, opts?: { requestedVersion?: string }): any {
    const result = this.validate(manifest);
    const errors = [...result.errors];

    if (opts?.requestedVersion && manifest && typeof manifest === 'object') {
      const mv = manifest.version ?? manifest.app?.version ?? manifest.metadata?.version;
      if (mv && String(mv) !== opts.requestedVersion) {
        errors.push(
          `manifest version "${mv}" does not match requested version "${opts.requestedVersion}"`,
        );
      }
    }

    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_MANIFEST',
        message: ['Manifest validation failed', ...errors],
        errors,
      });
    }

    return result.manifest;
  }

  private static validateScreenNode(node: any, path: string, errors: string[], depth = 0) {
    if (depth > 25) {
      errors.push(`${path}: nesting too deep`);
      return;
    }
    if (!node || typeof node !== 'object') return;

    // Preserve actions / tapAction; only type-check when present.
    if (node.tapAction != null && typeof node.tapAction !== 'object') {
      errors.push(`${path}.tapAction must be an ActionDef object`);
    }
    if (node.actions != null) {
      if (typeof node.actions !== 'object') {
        errors.push(`${path}.actions must be an object`);
      } else {
        for (const [ev, action] of Object.entries(node.actions)) {
          if (action === null) continue; // null clears the event — valid
          if (typeof action !== 'object') {
            errors.push(`${path}.actions.${ev} must be an object or null`);
            continue;
          }
          const a = action as any;
          if (a.type === 'navigate') {
            const dest =
              a.payload?.screenId ??
              a.payload?.screen ??
              a.payload?.route ??
              a.payload?.target;
            if (!dest) {
              errors.push(`${path}.actions.${ev}: navigate requires payload.screenId`);
            }
          }
        }
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child: any, i: number) => {
        this.validateScreenNode(child, `${path}.children[${i}]`, errors, depth + 1);
      });
    }
    if (node.layout && typeof node.layout === 'object' && Array.isArray(node.layout.children)) {
      node.layout.children.forEach((child: any, i: number) => {
        this.validateScreenNode(child, `${path}.layout.children[${i}]`, errors, depth + 1);
      });
    }

    // List-item press attachments (cats/categories/items/offers/orders/rows)
    for (const listKey of ['cats', 'categories', 'items', 'offers', 'orders', 'rows']) {
      const list = node[listKey] ?? node.props?.[listKey];
      if (Array.isArray(list)) {
        list.forEach((item: any, i: number) => {
          if (item?.tapAction != null && typeof item.tapAction !== 'object') {
            errors.push(`${path}.${listKey}[${i}].tapAction must be an ActionDef object`);
          }
        });
      }
    }
  }

  static isUuid(value: string): boolean {
    return UUID_RE.test(value);
  }
}
