import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  buildRuntimeContract,
  RUNTIME_LIMITS,
  SUPPORTED_ACTION_TYPES,
  SUPPORTED_CAPABILITIES,
  SUPPORTED_COMPONENT_TYPES,
  SUPPORTED_MANIFEST_VERSIONS,
} from './runtime-contract';

export interface CompatibilityReport {
  contract: { id: string; version: string };
  compatible: boolean;
  errors: string[];
  warnings: string[];
  counts: {
    screens: number;
    components: number;
    actions: number;
    assetReferences: number;
  };
  checkedAt: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keys whose subtrees hold props/config rather than renderable nodes. */
const NON_NODE_KEYS = new Set([
  'actions',
  'tapAction',
  'props',
  'style',
  'state',
  'config',
  'payload',
  'theme',
  'metadata',
  'identity',
  'meta',
  'branding',
  'runtime',
  'localization',
  'permissions',
  'assets',
  'capabilities',
]);

/**
 * B7 — validate schema/runtime/component/action capabilities and asset
 * references against the published runtime contract before activation.
 * Never activates an app the target shell cannot render.
 */
@Injectable()
export class CompatibilityService {
  private readonly contract = buildRuntimeContract();

  constructor(private prisma: PrismaService) {}

  getContract() {
    return this.contract;
  }

  async evaluate(
    manifest: any,
    opts?: { tenantId?: string },
  ): Promise<CompatibilityReport> {
    const errors = new Set<string>();
    const warnings = new Set<string>();
    const counts = { screens: 0, components: 0, actions: 0, assetReferences: 0 };
    const contractRef = {
      id: this.contract.contract,
      version: this.contract.contractVersion,
    };

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return {
        contract: contractRef,
        compatible: false,
        errors: ['manifest must be a JSON object'],
        warnings: [],
        counts,
        checkedAt: new Date().toISOString(),
      };
    }

    // ── Schema ──────────────────────────────────────────────────────────
    const rawVersion = manifest.manifestVersion ?? manifest.metadata?.schemaVersion;
    const supportedVersions: readonly string[] = SUPPORTED_MANIFEST_VERSIONS;
    if (rawVersion != null && !supportedVersions.includes(String(rawVersion))) {
      errors.add(
        `schema: manifestVersion "${rawVersion}" is not supported (supported: ${SUPPORTED_MANIFEST_VERSIONS.join(', ')})`,
      );
    }

    // ── Components / actions / depth ────────────────────────────────────
    const screens = manifest.screens;
    const screenList = Array.isArray(screens)
      ? screens
      : screens && typeof screens === 'object'
        ? Object.values(screens)
        : [];
    counts.screens = screenList.length;
    if (counts.screens > RUNTIME_LIMITS.maxScreens) {
      errors.add(
        `limits: ${counts.screens} screens exceeds maxScreens ${RUNTIME_LIMITS.maxScreens}`,
      );
    }

    for (const screen of screenList) {
      this.walkNodes(screen, 0, {
        onNode: (node) => {
          counts.components += 1;
          const type = node.type as string;
          if (!SUPPORTED_COMPONENT_TYPES.includes(type)) {
            errors.add(
              `component: "${type}" is not supported by this shell — see GET /api/v1/compatibility`,
            );
          }
        },
        onDepth: (depth) => {
          if (depth > RUNTIME_LIMITS.maxNestingDepth) {
            errors.add(
              `limits: nesting depth ${depth} exceeds maxNestingDepth ${RUNTIME_LIMITS.maxNestingDepth}`,
            );
          }
        },
      });

      this.walkAll(screen, (node, key) => {
        if (key === 'tapAction' || key === 'actions') return; // counted on the parent
        for (const actionType of actionTypesIn(node)) {
          counts.actions += 1;
          if (!SUPPORTED_ACTION_TYPES.includes(actionType)) {
            warnings.add(
              `action: "${actionType}" is not in the published action contract and will be ignored by the shell`,
            );
          }
        }
      });
    }

    if (counts.components > RUNTIME_LIMITS.maxComponents) {
      errors.add(
        `limits: ${counts.components} components exceeds maxComponents ${RUNTIME_LIMITS.maxComponents}`,
      );
    }

    // ── Capabilities ────────────────────────────────────────────────────
    for (const { id, kind, enabled } of readCapabilities(manifest.capabilities)) {
      if (enabled === false) continue;
      if (SUPPORTED_CAPABILITIES.includes(id)) continue;
      if (kind === 'required') {
        errors.add(
          `capability: required capability "${id}" is not supported by this shell (supported: ${SUPPORTED_CAPABILITIES.join(', ')})`,
        );
      } else {
        warnings.add(`capability: optional capability "${id}" is not supported by this shell`);
      }
    }

    // ── Asset references ────────────────────────────────────────────────
    const assetRefs = new Set<string>();
    for (const screen of screenList) {
      this.walkAll(screen, (node) => {
        if (typeof node.assetId === 'string') assetRefs.add(node.assetId);
        if (typeof node.imageUrl === 'string') assetRefs.add(node.imageUrl);
        const source = node.props?.source;
        if (source && typeof source === 'object' && typeof source.assetId === 'string') {
          assetRefs.add(source.assetId);
        }
      });
    }
    counts.assetReferences = assetRefs.size;
    if (counts.assetReferences > RUNTIME_LIMITS.maxAssetReferences) {
      errors.add(
        `limits: ${counts.assetReferences} asset references exceeds maxAssetReferences ${RUNTIME_LIMITS.maxAssetReferences}`,
      );
    }

    const uuidRefs = [...assetRefs].filter((ref) => UUID_RE.test(ref));
    if (uuidRefs.length > 0 && opts?.tenantId) {
      const rows: Array<{ id: string; tenantId: string; templateId: string | null }> =
        await this.prisma.media.findMany({
          where: { id: { in: uuidRefs } },
          select: { id: true, tenantId: true, templateId: true },
        });
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const ref of uuidRefs) {
        const row = byId.get(ref);
        if (!row) {
          errors.add(`asset: reference ${ref} does not exist`);
        } else if (row.tenantId !== opts.tenantId && !row.templateId) {
          errors.add(`asset: reference ${ref} belongs to a different tenant`);
        }
      }
    }

    const errorList = [...errors];
    return {
      contract: contractRef,
      compatible: errorList.length === 0,
      errors: errorList,
      warnings: [...warnings],
      counts,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Throws 422 INCOMPATIBLE_RUNTIME when the manifest must not activate. */
  async assertCompatible(
    manifest: any,
    opts?: { tenantId?: string },
  ): Promise<CompatibilityReport> {
    const report = await this.evaluate(manifest, opts);
    if (!report.compatible) {
      throw new UnprocessableEntityException({
        code: 'INCOMPATIBLE_RUNTIME',
        message: ['Runtime compatibility check failed', ...report.errors],
        errors: report.errors,
        warnings: report.warnings,
        contract: report.contract,
      });
    }
    return report;
  }

  /** Structural node walk — skips prop/config subtrees, tracks depth. */
  private walkNodes(
    node: any,
    depth: number,
    handlers: { onNode: (node: any) => void; onDepth: (depth: number) => void },
  ) {
    if (!node || typeof node !== 'object') return;
    handlers.onDepth(depth);
    if (Array.isArray(node)) {
      for (const item of node) this.walkNodes(item, depth + 1, handlers);
      return;
    }
    if (isNodeShape(node)) handlers.onNode(node);
    for (const [key, value] of Object.entries(node)) {
      if (NON_NODE_KEYS.has(key)) continue;
      this.walkNodes(value, depth + 1, handlers);
    }
  }

  /** Full traversal (enters props) used for actions and asset references. */
  private walkAll(
    node: any,
    visit: (node: any, key?: string) => void,
    depth = 0,
    key?: string,
    insideActions = false,
  ) {
    if (!node || typeof node !== 'object' || depth > 40) return;
    if (Array.isArray(node)) {
      for (const item of node) this.walkAll(item, visit, depth + 1, key, insideActions);
      return;
    }
    if (!insideActions) visit(node, key);
    const nested = insideActions || key === 'tapAction' || key === 'actions';
    for (const [childKey, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        this.walkAll(value, visit, depth + 1, childKey, nested);
      }
    }
  }
}

/**
 * A renderable component/section node: has a string `type` and is not an
 * action definition (`{ type, payload }` without node structure).
 */
function isNodeShape(node: any): boolean {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return false;
  const hasNodeStructure =
    node.props != null ||
    node.children != null ||
    node.layout != null ||
    node.key != null ||
    node.config != null ||
    node.blocks != null;
  const isActionDef = node.payload != null && !hasNodeStructure;
  return !isActionDef;
}

/** Action types declared on this node: `tapAction`, `actions`, or the node itself. */
function actionTypesIn(node: any): string[] {
  const found: string[] = [];
  if (isActionShape(node)) found.push(node.type);

  const tap = node?.tapAction;
  if (tap && typeof tap === 'object' && typeof tap.type === 'string') found.push(tap.type);

  const actions = node?.actions;
  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (action && typeof action.type === 'string') found.push(action.type);
    }
  } else if (actions && typeof actions === 'object') {
    for (const action of Object.values(actions)) {
      if (action && typeof action === 'object' && typeof (action as any).type === 'string') {
        found.push((action as any).type);
      }
    }
  }
  return found;
}

function isActionShape(node: any): boolean {
  return (
    !!node &&
    typeof node === 'object' &&
    typeof node.type === 'string' &&
    node.payload != null &&
    node.props == null &&
    node.children == null &&
    node.layout == null &&
    node.key == null
  );
}

function readCapabilities(
  capabilities: any,
): Array<{ id: string; kind: string; enabled?: boolean }> {
  const out: Array<{ id: string; kind: string; enabled?: boolean }> = [];
  if (!capabilities) return out;

  if (Array.isArray(capabilities)) {
    for (const entry of capabilities) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.capabilityId ?? entry.id ?? entry.name;
      if (typeof id !== 'string') continue;
      out.push({ id, kind: entry.type === 'required' ? 'required' : 'optional', enabled: entry.enabled });
    }
    return out;
  }

  if (typeof capabilities === 'object') {
    for (const [id, value] of Object.entries(capabilities)) {
      const entry = (value ?? {}) as any;
      out.push({
        id,
        kind: entry.type === 'required' ? 'required' : 'optional',
        enabled: entry.enabled,
      });
    }
  }
  return out;
}
