// projectMemberController.js — stubbed out for single-user OSS mode
// Team/member management is not applicable in single-user mode.

const notAvailable = (_req, res) =>
  res.status(400).json({
    success: false,
    error: "Member management is not available in single-user mode",
  });

export {
  notAvailable as getProjectMembers,
  notAvailable as addProjectMember,
  notAvailable as updateProjectMember,
  notAvailable as removeProjectMember,
  notAvailable as acceptProjectInvitation,
  notAvailable as rejectProjectInvitation,
  notAvailable as updateMemberViewPreferences,
  notAvailable as updateMemberAccessibleViews,
  notAvailable as updateMemberViewPermissions,
  notAvailable as leaveProject,
};
