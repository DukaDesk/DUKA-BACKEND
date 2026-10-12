import { createHash } from 'crypto';
export const DATA_FIELDS = ['name', 'email', 'phone', 'avatar'];
export const DATA_ACTIONS = ['checkout', 'submit_form'];
export function consentPolicy(raw: any) {
  if (!raw || raw.enabled !== true) return null;
  if (!Array.isArray(raw.fields) || !raw.fields.length || raw.fields.some((f: any) => !DATA_FIELDS.includes(f))) throw new Error('Data request must select supported fields');
  if (typeof raw.purpose !== 'string' || !raw.purpose.trim() || raw.purpose.length > 500) throw new Error('Data request needs a purpose (up to 500 characters)');
  if (!Array.isArray(raw.requiredFor) || raw.requiredFor.some((a: any) => !DATA_ACTIONS.includes(a))) throw new Error('Unsupported data request action');
  const request = { purpose: raw.purpose.trim(), fields: [...new Set<string>(raw.fields)].sort(), requiredFor: [...new Set<string>(raw.requiredFor)].sort() };
  return { ...request, policyId: createHash('sha256').update(JSON.stringify(request)).digest('hex') };
}
