import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { MobileBffController } from './mobile-bff.controller';
describe('merchant manifest route', () => {
  it('exposes the merchant path and preserves the immutable payload through both readers', async () => {
    const payload = { manifest: { tenantId: 'historical-id' }, checksum: 'unchanged' };
    const mobile = { getTenantManifest: jest.fn().mockResolvedValue(payload) };
    const controller = new MobileBffController(mobile as any, {} as any);
    expect(Reflect.getMetadata(PATH_METADATA, controller.getManifest)).toBe('merchants/:slug/manifest');
    expect(await controller.getManifest('shop')).toBe(payload);
    expect(await controller.getLegacyManifest('shop')).toBe(payload);
    expect(mobile.getTenantManifest).toHaveBeenCalledWith('shop');
  });
});
