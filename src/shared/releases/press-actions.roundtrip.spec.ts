import { ManifestValidator } from '../../modules/publishing/manifest-validator.service';
import { ActiveReleaseService } from './active-release.service';

/**
 * Press-action delivery round-trip (backend TODO 2026-09-20):
 * two category pills targeting different screen IDs must survive publish
 * and both canonical read paths.
 */
describe('press action delivery round-trip', () => {
  const manifest = {
    manifestVersion: '1.0.0',
    version: '2.0.0',
    navigation: { initialScreen: 'home', tabs: [{ id: 't', screenId: 'home', label: 'Home' }] },
    screens: {
      home: {
        screenId: 'home',
        name: 'Home',
        layout: {
          kind: 'scroll',
          children: [
            {
              type: 'category_pills',
              props: {
                items: [
                  {
                    id: 'pill-1',
                    label: 'Food',
                    tapAction: { type: 'navigate', payload: { screenId: 'food' } },
                  },
                  {
                    id: 'pill-2',
                    label: 'Events',
                    tapAction: { type: 'navigate', payload: { screenId: 'events' } },
                  },
                ],
              },
              categories: [
                { id: 'pill-1', tapAction: { type: 'navigate', payload: { screenId: 'food' } } },
                { id: 'pill-2', tapAction: { type: 'navigate', payload: { screenId: 'events' } } },
              ],
            },
          ],
        },
      },
      food: { screenId: 'food', name: 'Food', layout: { kind: 'scroll', children: [] } },
      events: { screenId: 'events', name: 'Events', layout: { kind: 'scroll', children: [] } },
    },
  };

  it('validates two pills with distinct destinations', () => {
    expect(() => ManifestValidator.assertValid(manifest)).not.toThrow();
  });

  it('round-trips through toPublicPayload without mutating actions', () => {
    const release = {
      id: 'rel-1',
      version: '2.0.0',
      checksum: 'deadbeef',
      channel: 'production',
      publishedAt: new Date('2026-09-20T00:00:00Z'),
      manifest: JSON.parse(JSON.stringify(manifest)),
    };

    // toPublicPayload does not use `this` — call via prototype without DI
    const payload = (ActiveReleaseService.prototype as any).toPublicPayload.call(
      null,
      release,
    );

    const pills = payload.screens.home.layout.children[0];
    expect(pills.categories[0].tapAction.payload.screenId).toBe('food');
    expect(pills.categories[1].tapAction.payload.screenId).toBe('events');
    expect(payload.release.version).toBe('2.0.0');
    expect(payload.release.checksum).toBe('deadbeef');
  });
});
