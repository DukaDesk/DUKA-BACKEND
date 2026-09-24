import { ManifestValidator } from './manifest-validator.service';

describe('ManifestValidator (B1)', () => {
  const validObjectScreens = {
    manifestVersion: '1.0.0',
    version: '1.2.3',
    identity: { slug: 'published-fixture', displayName: 'Published Fixture' },
    navigation: {
      initialScreen: 'home',
      tabs: [{ id: 'home-tab', screenId: 'home', label: 'Home' }],
    },
    splash: { enabled: true, durationMs: 1200, screen: { screenId: '__published_splash__' } },
    screens: {
      home: {
        name: 'Home',
        screenId: 'home',
        layout: {
          kind: 'scroll',
          children: [
            {
              type: 'button',
              props: { label: 'Go', tapAction: { type: 'navigate', payload: { screenId: 'details' } } },
              actions: { onPress: { type: 'navigate', payload: { screenId: 'details' } } },
              categories: [
                { id: 'a', label: 'A', tapAction: { type: 'navigate', payload: { screenId: 'home' } } },
                { id: 'b', label: 'B', tapAction: { type: 'navigate', payload: { screenId: 'details' } } },
              ],
            },
          ],
        },
      },
      details: { name: 'Details', screenId: 'details', layout: { kind: 'scroll', children: [] } },
    },
  };

  it('accepts the canonical 1.0.0 object-screen manifest', () => {
    const result = ManifestValidator.validate(validObjectScreens);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('preserves screens as an object map (does not rewrite to array)', () => {
    const out = ManifestValidator.assertValid(validObjectScreens);
    expect(out.screens).toBe(validObjectScreens.screens);
    expect(Array.isArray(out.screens)).toBe(false);
    expect(Object.keys(out.screens)).toEqual(['home', 'details']);
  });

  it('preserves splash, navigation, and nested tapAction/actions', () => {
    const out = ManifestValidator.assertValid(validObjectScreens);
    expect(out.splash.durationMs).toBe(1200);
    expect(out.navigation.initialScreen).toBe('home');
    const child = out.screens.home.layout.children[0];
    expect(child.props.tapAction.payload.screenId).toBe('details');
    expect(child.actions.onPress.type).toBe('navigate');
    expect(child.categories[0].tapAction.payload.screenId).toBe('home');
    expect(child.categories[1].tapAction.payload.screenId).toBe('details');
  });

  it('preserves null action entries (explicit clear)', () => {
    const m = JSON.parse(JSON.stringify(validObjectScreens));
    m.screens.home.layout.children[0].actions.onPress = null;
    const result = ManifestValidator.validate(m);
    expect(result.valid).toBe(true);
    expect(m.screens.home.layout.children[0].actions.onPress).toBeNull();
  });

  it('rejects navigate actions without a destination', () => {
    const m = JSON.parse(JSON.stringify(validObjectScreens));
    m.screens.home.layout.children[0].actions.onPress = { type: 'navigate', payload: {} };
    const result = ManifestValidator.validate(m);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('navigate');
  });

  it('rejects missing screens', () => {
    const result = ManifestValidator.validate({ manifestVersion: '1.0.0' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('screens is required');
  });

  it('rejects empty screens object', () => {
    const result = ManifestValidator.validate({ screens: {} });
    expect(result.valid).toBe(false);
  });

  it('rejects version mismatch with requested version', () => {
    expect(() =>
      ManifestValidator.assertValid(validObjectScreens, { requestedVersion: '9.9.9' }),
    ).toThrow();
  });

  it('rejects unsupported manifestVersion', () => {
    const result = ManifestValidator.validate({
      manifestVersion: '2.0.0',
      screens: { home: { screenId: 'home' } },
    });
    expect(result.valid).toBe(false);
  });

  it('accepts legacy screens as a non-empty array', () => {
    const result = ManifestValidator.validate({
      screens: [{ screenId: 'home', name: 'Home' }],
    });
    expect(result.valid).toBe(true);
  });

  it('throws UnprocessableEntityException-shaped error via assertValid', () => {
    let thrown: any;
    try {
      ManifestValidator.assertValid({ screens: [] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown.getStatus?.() ?? thrown.status).toBe(422);
    expect(thrown.response?.code ?? thrown.code).toBe('INVALID_MANIFEST');
  });
});
