import SetGoDefaultBanner from './SetGoDefaultBanner';

/**
 * Banner rendered at the bottom of CarteleraTorneos (public view).
 *
 * Logic per plan:
 *  - premium + white_label → nothing
 *  - all other plans       → SetGo default banner
 *
 * NOTE: club ads management is disabled (coming soon).
 */
export default function PublicClubBanner({ clubPlan, clubWhiteLabel }) {
  if (clubPlan === 'premium' && clubWhiteLabel) return null;

  return <SetGoDefaultBanner />;
}
