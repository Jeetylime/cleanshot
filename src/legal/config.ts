/**
 * Details the legal pages depend on. Anything left as `null` is shown on the
 * pages as a highlighted placeholder, and a "draft" notice appears at the top
 * of each policy until every value is filled in.
 *
 * Fill these in only with real, verified information.
 */
export const LEGAL = {
  /** Date shown as "Last updated" on all three policies. Change it whenever a policy changes. */
  lastUpdated: '2026-11-16',

  /** Email address for general, legal and privacy questions. */
  contactEmail: 'hello@studiolo.page' as string | null,

  /** Governing law and courts, e.g. "the State of Delaware, USA". Needs a legal decision. */
  governingLaw: 'the Commonwealth of Pennsylvania, USA' as string | null,

  /** Minimum age to use Studiolo. Needs a legal decision (13 and 16 are common). */
  minimumAge: 13 as number | null,
};

export const LEGAL_COMPLETE =
  LEGAL.contactEmail !== null && LEGAL.governingLaw !== null && LEGAL.minimumAge !== null;
