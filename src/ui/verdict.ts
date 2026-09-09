import type { MarkSummary } from '../shared/messages.js';
import { ICONS, type IconName } from './icons.js';

export type VerdictStyle = 'strong' | 'secondary' | 'delegated' | 'failed' | 'neutral';

export interface VerdictView {
  style: VerdictStyle;
  icon: IconName;
  label: string;
  /** The second line: the reason, the page signed for, or the date withdrawn. */
  detail?: string;
}

/**
 * One place decides what each verdict says and how it looks. The strong style
 * is reserved for a URL match; a moved or unbound Mark is secondary by design;
 * a delegated Mark is never drawn as a human verdict; a fetch failure is
 * neutral and never a failure.
 */
export function verdictView(m: Pick<MarkSummary, 'verdict' | 'reason' | 'signedUrl' | 'withdrawn' | 'delegation' | 'failedStep'>): VerdictView {
  switch (m.verdict) {
    case 'verified_here': return { style: 'strong', icon: 'badge-check', label: 'Verified by ZOREAL' };
    case 'verified_in_channel': return { style: 'strong', icon: 'badge-check', label: 'Verified in this channel' };
    case 'verified_email': return { style: 'strong', icon: 'badge-check', label: 'Verified from this sender to these recipients' };
    case 'verified_email_other_recipients': return { style: 'secondary', icon: 'mail', label: 'Verified, but sent to different recipients' };
    case 'verified_email_other_sender': return { style: 'secondary', icon: 'mail', label: 'Verified, but from a different sender' };
    case 'verified_other_page': return { style: 'secondary', icon: 'link-2-off', label: 'Verified for another page', detail: m.signedUrl ? `Signed for ${m.signedUrl}` : undefined };
    case 'verified_unbound': return { style: 'secondary', icon: 'link-2-off', label: 'Verified, not bound to a page' };
    case 'delegated': return { style: 'delegated', icon: 'bot', label: 'Posted by an agent operated by a verified human', detail: m.delegation ? `${m.delegation.agentName}, operated by ${m.delegation.humanSubject}` : undefined };
    case 'withdrawn': return { style: 'secondary', icon: 'archive-x', label: `Withdrawn by the signer on ${m.withdrawn?.at ? dateOnly(m.withdrawn.at) : 'an unknown date'}` };
    case 'cannot_verify_now': return { style: 'neutral', icon: 'clock', label: 'Cannot verify now', detail: m.reason };
    case 'no_signature': return { style: 'neutral', icon: 'shield-alert', label: 'No signature found', detail: m.reason };
    case 'not_verified': return { style: 'failed', icon: 'shield-x', label: 'Not verified', detail: m.reason };
  }
}

export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function icon(name: IconName): string {
  return ICONS[name];
}

export function subjectLine(m: Pick<MarkSummary, 'identity' | 'subject' | 'site'>): string {
  if (m.identity === 'legal_name' && m.subject && typeof m.subject === 'object' && 'name' in m.subject) {
    const s = m.subject as { name: string; document_type: string; issuing_country: string };
    return `${s.name}, verified against a ${s.issuing_country} ${s.document_type}`;
  }
  if (m.identity === 'organisation' && m.subject && typeof m.subject === 'object' && 'legal_name' in m.subject) {
    const s = m.subject as { legal_name: string; registration_number: string; country: string };
    return `Verified organisation: ${s.legal_name} (${s.country} ${s.registration_number})`;
  }
  const persona = typeof m.subject === 'string' ? m.subject : '';
  return `A verified human${persona ? `, ${persona}` : ''}${m.site ? ` on ${m.site}` : ''}`;
}
