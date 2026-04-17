// projectGuestController.js — stubbed out for single-user OSS mode
// Guest/viewer management is not applicable in single-user mode.

const notAvailable = (_req, res) =>
  res.status(400).json({
    success: false,
    error: "Guest management is not available in single-user mode",
  });

export {
  notAvailable as getProjectGuests,
  notAvailable as inviteGuest,
  notAvailable as removeGuest,
  notAvailable as updateGuestPermissions,
  notAvailable as acceptGuestInvitation,
};
