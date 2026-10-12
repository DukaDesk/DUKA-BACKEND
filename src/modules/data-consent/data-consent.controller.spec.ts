import { DataConsentController } from './data-consent.controller';
describe('data consent access boundaries', () => {
 it('does not read a profile for a non-member or another merchant', async () => {
  const consent: any = { sharedProfile: jest.fn() };
  const prisma: any = { tenantUser: { findFirst: jest.fn().mockResolvedValue(null) } };
  const controller = new DataConsentController(consent, prisma);
  await expect(controller.profile('owner-a','merchant-b','consumer')).rejects.toThrow('Merchant access required');
  expect(consent.sharedProfile).not.toHaveBeenCalled();
  expect(prisma.tenantUser.findFirst).toHaveBeenCalledWith({where:{tenantId:'merchant-b',userId:'owner-a',role:{in:['owner','manager']},status:'active'}});
 });
 it('uses the authenticated user for listing and revocation', async () => {
  const consent: any = { list: jest.fn(), revoke: jest.fn() };
  const controller = new DataConsentController(consent, {} as any);
  controller.list('consumer-a'); controller.revoke('consumer-a','merchant-b');
  expect(consent.list).toHaveBeenCalledWith('consumer-a');
  expect(consent.revoke).toHaveBeenCalledWith('consumer-a','merchant-b');
 });
});
