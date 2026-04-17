// versionGroupController.js - Version Group Controller for managing group names
// import * as versionGroupService from "../service/versionGroupService.js";

const disabledResponse = (res) =>
  res.status(503).json({
    success: false,
    error: "Version history temporarily disabled",
  });

export const getGroupNames = async (req, res) => {
  return disabledResponse(res);
};

export const updateGroupName = async (req, res) => {
  return disabledResponse(res);
};

export const deleteGroupName = async (req, res) => {
  return disabledResponse(res);
};

/*

// Get all group names for a note
export const getGroupNames = async (req, res) => {
  try {
    const { noteId } = req.params;

    console.log("GetGroupNames - Params:", { noteId });

    const groupNames = await versionGroupService.getGroupNames(
      noteId,
      req.user.id,
      req.supabase
    );

    res.json({ success: true, data: groupNames });
  } catch (error) {
    console.error("Get group names error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to get group names",
    });
  }
};

// Update/Set a group name
export const updateGroupName = async (req, res) => {
  try {
    const { noteId, groupKey } = req.params;
    const { name } = req.body;

    console.log("UpdateGroupName - Params:", { noteId, groupKey, name });

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Group name is required",
      });
    }

    const result = await versionGroupService.updateGroupName(
      noteId,
      groupKey,
      name.trim(),
      req.user.id,
      req.supabase
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Update group name error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to update group name",
    });
  }
};

// Delete a group name
export const deleteGroupName = async (req, res) => {
  try {
    const { noteId, groupKey } = req.params;

    console.log("DeleteGroupName - Params:", { noteId, groupKey });

    await versionGroupService.deleteGroupName(
      noteId,
      groupKey,
      req.user.id,
      req.supabase
    );

    res.json({ success: true, message: "Group name deleted successfully" });
  } catch (error) {
    console.error("Delete group name error:", error);
    const statusCode =
      error.message === "Note not found"
        ? 404
        : error.message.includes("permission")
        ? 403
        : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to delete group name",
    });
  }
};

*/
