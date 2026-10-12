import { DataConsentService } from './data-consent.service';
import { consentPolicy } from './policy';
const request = { enabled: true, purpose: 'Contact you about your order', fields: ['name', 'email'], requiredFor: ['checkout'] };
function setup(record: any = null) {
 const prisma: any = { consent: { findUnique: jest.fn().mockResolvedValue(record), upsert: jest.fn() }, consentAudit: { create: jest.fn() }, user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ firstName: 'Ada', lastName: 'A', email: 'a@example.com', phoneNumber: 'private', profile: { avatarUrl: 'private-photo' } }) } };
 prisma.$transaction = jest.fn(fn => fn(prisma));
 const releases: any = { getActiveRelease: jest.fn().mockResolvedValue({ tenantId: 'app-a', slug: 'shop', release: { manifest: { identity: { displayName: 'Shop' }, dataRequest: request } } }) };
 return { prisma, releases, service: new DataConsentService(prisma, releases) };
}
function record(status = 'active', policy = request) { return { status, scopes: [{ scope: 'data-policy:' + consentPolicy(policy)!.policyId }] }; }
describe('published app data consent', () => {
 it('binds approval to fields, purpose and action requirements but not app release version', () => {
  expect(consentPolicy(request)!.policyId).toBe(consentPolicy({ ...request, fields: ['email','name'] })!.policyId);
  expect(consentPolicy(request)!.policyId).not.toBe(consentPolicy({ ...request, purpose: 'Marketing' })!.policyId);
  expect(() => consentPolicy({ ...request, fields: ['password'] })).toThrow();
 });
 it('does not accept an old request as approval for changed data', async () => {
  const { service } = setup(record('active', { ...request, fields: ['name'] }));
  expect((await service.status('user-a', 'app-a')).decision).toBe('unanswered');
  await expect(service.requireFor('user-a','app-a','checkout')).rejects.toThrow();
 });
 it('remembers a decline and blocks required checkout', async () => {
  const { service, prisma } = setup(record('revoked'));
  expect((await service.status('user-a','app-a')).decision).toBe('declined');
  await expect(service.requireFor('user-a','app-a','checkout')).rejects.toThrow();
  expect(prisma.consent.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId_userId: { tenantId: 'app-a', userId: 'user-a' } } }));
 });
 it('saves only the server policy and audits a decision atomically', async () => {
  const { service, prisma } = setup();
  const policyId = consentPolicy(request)!.policyId;
  await service.decide('user-a','app-a',policyId,true);
  expect(prisma.consent.upsert.mock.calls[0][0].create.scopes.create).toEqual([{scope:'data-policy:'+policyId},{scope:'data:email'},{scope:'data:name'}]);
  expect(prisma.consentAudit.create).toHaveBeenCalled();
  await expect(service.decide('user-a','app-a','stale',true)).rejects.toThrow();
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
 });
 it('shares only approved fields and denies revoked access', async () => {
  const { service } = setup(record());
  expect(await service.sharedProfile('user-a','app-a')).toEqual({ name: 'Ada A', email: 'a@example.com' });
  await expect(setup(record('revoked')).service.sharedProfile('user-a','app-a')).rejects.toThrow();
 });
 it('does not require consent for unrelated actions, but requires identity for checkout', async () => {
  const { service } = setup();
  await expect(service.requireFor(undefined as any,'app-a','submit_form')).resolves.toMatchObject({decision:'not_required'});
  await expect(service.requireFor(undefined as any,'app-a','checkout')).rejects.toThrow();
 });
});

it('never transfers an approval to a second app with an identical policy', async () => {
 const { service, releases, prisma } = setup();
 releases.getActiveRelease.mockImplementation(async (merchantId: string) => ({tenantId:merchantId,slug:'shop',release:{manifest:{dataRequest:request}}}));
 prisma.consent.findUnique.mockImplementation(async ({where}: any) => where.tenantId_userId.tenantId === 'app-a' ? record() : null);
 expect((await service.status('user-a','app-a')).decision).toBe('granted');
 expect((await service.status('user-a','app-b')).decision).toBe('unanswered');
 await expect(service.sharedProfile('user-a','app-b')).rejects.toThrow();
});

it('revokes independently of the published release and removes data scopes', async () => {
 const {service, prisma, releases}=setup({id:'consent-a',...record()});
 prisma.consent.update=jest.fn();
 releases.getActiveRelease.mockRejectedValue(new Error('App unpublished'));
 await service.revoke('user-a','app-a');
 expect(releases.getActiveRelease).not.toHaveBeenCalled();
 expect(prisma.consent.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'consent-a'},data:expect.objectContaining({status:'revoked',scopes:{deleteMany:{scope:{startsWith:'data:'}}}})}));
 expect(prisma.consentAudit.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:'user-a',tenantId:'app-a',action:'revoke',granted:false})}));
});

it('lists only the caller choices and hides revoked fields and internal policy markers', async () => {
 const {service,prisma}=setup();
 prisma.consent.findMany=jest.fn().mockResolvedValue([{tenantId:'app-a',status:'revoked',tenant:{name:'Shop',slug:'shop'},scopes:[{scope:'data-policy:secret'},{scope:'data:email'}]}]);
 const result=await service.list('user-a');
 expect(prisma.consent.findMany.mock.calls[0][0].where.userId).toBe('user-a');
 expect(result[0].fields).toEqual([]);
 expect(JSON.stringify(result)).not.toContain('secret');
});
