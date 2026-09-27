import { UnprocessableEntityException } from '@nestjs/common';
import { CompatibilityService } from './compatibility.service';
import {
  RUNTIME_CONTRACT_ID,
  RUNTIME_CONTRACT_VERSION,
  SUPPORTED_COMPONENT_TYPES,
} from './runtime-contract';

const supportedManifest = {
  manifestVersion: '1.0.0',
  identity: { slug: 'published-fixture', displayName: 'Published Fixture' },
  navigation: {
    initialScreen: 'home',
    tabs: [{ id: 'home-tab', screenId: 'home', label: 'Home' }],
  },
  capabilities: { catalog: { enabled: true, type: 'optional' } },
  screens: {
    home: {
      name: 'Home',
      screenId: 'home',
      layout: {
        kind: 'scroll',
        children: [
          {
            type: 'button',
            props: {
              label: 'Go',
              tapAction: { type: 'navigate', payload: { screenId: 'details' } },
            },
          },
        ],
      },
    },
    details: { name: 'Details', screenId: 'details', layout: { kind: 'scroll', children: [] } },
  },
};

function makeService(rows: Array<Record<string, any>> = []) {
  const prisma: any = {
    media: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  return { service: new CompatibilityService(prisma), prisma };
}

describe('CompatibilityService (B7)', () => {
  it('serves the machine-readable contract', () => {
    const contract = makeService().service.getContract();
    expect(contract.contract).toBe(RUNTIME_CONTRACT_ID);
    expect(contract.contractVersion).toBe(RUNTIME_CONTRACT_VERSION);
    expect(contract.components.unknownPolicy).toBe('reject');
    expect(contract.actions.unknownPolicy).toBe('warn');
    expect(contract.components.supported).toEqual(SUPPORTED_COMPONENT_TYPES);
    expect(contract.components.count).toBe(contract.components.supported.length);
    expect(contract.preflight.method).toBe('POST');
  });

  it('accepts a manifest the shell can render', async () => {
    const { service } = makeService();
    const report = await service.evaluate(supportedManifest, { tenantId: 't1' });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.compatible).toBe(true);
    expect(report.contract).toEqual({ id: RUNTIME_CONTRACT_ID, version: RUNTIME_CONTRACT_VERSION });
    expect(report.counts).toEqual({ screens: 2, components: 1, actions: 1, assetReferences: 0 });
  });

  it('rejects a component type the shell cannot render', async () => {
    const { service } = makeService();
    const manifest = JSON.parse(JSON.stringify(supportedManifest));
    manifest.screens.home.layout.children.push({ type: 'holo_deck', props: {} });

    const report = await service.evaluate(manifest, { tenantId: 't1' });
    expect(report.compatible).toBe(false);
    expect(report.errors.join(' ')).toContain('"holo_deck" is not supported');
  });

  it('warns (does not block) on an unknown action type', async () => {
    const { service } = makeService();
    const manifest = JSON.parse(JSON.stringify(supportedManifest));
    manifest.screens.home.layout.children[0].props.tapAction = {
      type: 'mind_meld',
      payload: {},
    };

    const report = await service.evaluate(manifest, { tenantId: 't1' });
    expect(report.compatible).toBe(true);
    expect(report.warnings.join(' ')).toContain('"mind_meld"');
  });

  it('counts a standalone action definition once', async () => {
    const { service } = makeService();
    const manifest = JSON.parse(JSON.stringify(supportedManifest));
    manifest.screens.details.layout.children.push({
      type: 'navigate',
      payload: { screenId: 'home' },
    });

    const report = await service.evaluate(manifest, { tenantId: 't1' });
    // the standalone action is an action, not a component
    expect(report.counts.components).toBe(1);
    expect(report.counts.actions).toBe(2);
    expect(report.compatible).toBe(true);
  });

  it('rejects an unsupported manifest version', async () => {
    const { service } = makeService();
    const report = await service.evaluate(
      { ...supportedManifest, manifestVersion: '2.5.0' },
      { tenantId: 't1' },
    );
    expect(report.compatible).toBe(false);
    expect(report.errors.join(' ')).toContain('manifestVersion "2.5.0"');
  });

  it('rejects an unknown required capability and warns on an unknown optional one', async () => {
    const { service } = makeService();
    const required = await service.evaluate(
      { ...supportedManifest, capabilities: { time_travel: { type: 'required' } } },
      { tenantId: 't1' },
    );
    expect(required.compatible).toBe(false);
    expect(required.errors.join(' ')).toContain('time_travel');

    const optional = await service.evaluate(
      { ...supportedManifest, capabilities: { time_travel: { type: 'optional' } } },
      { tenantId: 't1' },
    );
    expect(optional.compatible).toBe(true);
    expect(optional.warnings.join(' ')).toContain('time_travel');
  });

  it('rejects a media id that does not exist', async () => {
    const { service } = makeService([]);
    const manifest = JSON.parse(JSON.stringify(supportedManifest));
    manifest.screens.home.layout.children.push({
      type: 'image',
      props: { assetId: '11111111-2222-3333-4444-555555555555' },
    });

    const report = await service.evaluate(manifest, { tenantId: 't1' });
    expect(report.compatible).toBe(false);
    expect(report.errors.join(' ')).toContain('does not exist');
    expect(report.counts.assetReferences).toBe(1);
  });

  it('rejects a media id owned by another tenant', async () => {
    const { service } = makeService([
      { id: '11111111-2222-3333-4444-555555555555', tenantId: 'other', templateId: null },
    ]);
    const manifest = JSON.parse(JSON.stringify(supportedManifest));
    manifest.screens.home.layout.children.push({
      type: 'image',
      props: { assetId: '11111111-2222-3333-4444-555555555555' },
    });

    const report = await service.evaluate(manifest, { tenantId: 't1' });
    expect(report.compatible).toBe(false);
    expect(report.errors.join(' ')).toContain('different tenant');
  });

  it('accepts absolute and root-relative asset references without a lookup', async () => {
    const { service, prisma } = makeService();
    const manifest = JSON.parse(JSON.stringify(supportedManifest));
    manifest.screens.home.layout.children.push(
      { type: 'image', props: { imageUrl: 'https://cdn.example.com/a.png' } },
      { type: 'image', props: { imageUrl: '/templates/clinic.png' } },
    );

    const report = await service.evaluate(manifest, { tenantId: 't1' });
    expect(report.compatible).toBe(true);
    expect(report.counts.assetReferences).toBe(2);
    expect(prisma.media.findMany).not.toHaveBeenCalled();
  });

  it('rejects a manifest above the declared screen limit', async () => {
    const { service } = makeService();
    const screens: Record<string, any> = {};
    for (let i = 0; i < 201; i += 1) screens[`s${i}`] = { screenId: `s${i}` };

    const report = await service.evaluate(
      { ...supportedManifest, screens },
      { tenantId: 't1' },
    );
    expect(report.compatible).toBe(false);
    expect(report.errors.join(' ')).toContain('maxScreens');
  });

  it('assertCompatible throws INCOMPATIBLE_RUNTIME and keeps the report', async () => {
    const { service } = makeService();
    const manifest = { screens: { home: { screenId: 'home', type: 'flux_capacitor' } } };

    await expect(service.assertCompatible(manifest, { tenantId: 't1' })).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: 'INCOMPATIBLE_RUNTIME' }),
    });

    try {
      await service.assertCompatible(manifest, { tenantId: 't1' });
      throw new Error('expected rejection');
    } catch (err: any) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(err.getResponse().contract.id).toBe(RUNTIME_CONTRACT_ID);
      expect(err.getResponse().errors.join(' ')).toContain('flux_capacitor');
    }
  });
});
