// Public identifier, not a credential. Set TRADING_OWNER_UID to transfer ownership.
export const tradingOwner = () =>
  process.env.TRADING_OWNER_UID || "T3OJomXeXohNl3ns5sFLnRB314Z2";
export const canTrade = (uid, profile) =>
  uid === tradingOwner() && profile?.status === "active";
export function miniApps(uid, profile) {
  if (!["active", "invited"].includes(profile?.status)) return [];
  return [
    "account",
    "contact-team",
    ...(profile.role === "admin" && profile.status === "active"
      ? ["user-access"]
      : []),
    ...(canTrade(uid, profile) ? ["trading"] : []),
  ];
}
