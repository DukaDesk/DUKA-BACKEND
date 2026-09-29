import { NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { MerchantsService } from '../../modules/merchants/merchants.service';
describe('merchant errors', () => {
  it('retains a stable code and the existing errors array in HTTP responses', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    new HttpExceptionFilter().catch(new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' }), { switchToHttp: () => ({ getResponse: () => response }) } as any);
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ success: false, errors: ['Merchant not found'], code: 'MERCHANT_NOT_FOUND' });
  });
  it('uses merchant terminology when an ID is absent', async () => {
    const service = new MerchantsService({ tenant: { findUnique: jest.fn().mockResolvedValue(null) } } as any);
    try { await service.findById('missing'); throw new Error('Expected missing merchant'); }
    catch (error) { expect((error as NotFoundException).getResponse()).toEqual({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' }); }
  });
});
