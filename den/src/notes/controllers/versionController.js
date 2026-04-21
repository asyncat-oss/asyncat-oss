// versionController.js - Version History Controller
// import * as versionService from "../service/versionService.js";

const disabledResponse = (res) =>
  res.status(503).json({
    success: false,
    error: "Version history temporarily disabled",
  });

export const getVersionHistory = async (req, res) => {
  return disabledResponse(res);
};

export const getVersion = async (req, res) => {
  return disabledResponse(res);
};

export const createNamedVersion = async (req, res) => {
  return disabledResponse(res);
};

export const createAutoVersion = async (req, res) => {
  return disabledResponse(res);
};

export const restoreVersion = async (req, res) => {
  return disabledResponse(res);
};

export const compareVersions = async (req, res) => {
  return disabledResponse(res);
};

export const getOperationHistory = async (req, res) => {
  return disabledResponse(res);
};

export const cleanupVersions = async (req, res) => {
  return disabledResponse(res);
};

export const updateVersionName = async (req, res) => {
  return disabledResponse(res);
};

/*

// Get version history for a note
export const getVersionHistory = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { limit = '50', offset = '0', majorOnly = 'false' } = req.query;

    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    const majorOnlyBool = majorOnly === 'true';

    console.log("GetVersionHistory - Query params:", {
      noteId,
      limit: limitNum,
      offset: offsetNum,
      majorOnly: majorOnlyBool
    });

    const result = await versionService.getVersionHistory(
      noteId,
      req.user.id,
      limitNum,
      offsetNum,
      majorOnlyBool,
      req.db
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Get version history error:", error);
    const statusCode = error.message === "Note not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to get version history"
    });
  }
};

// Get specific version
export const getVersion = async (req, res) => {
  try {
    const { noteId, versionId } = req.params;

    console.log("GetVersion - Params:", { noteId, versionId });

    const version = await versionService.getVersion(
      noteId,
      versionId,
      req.user.id,
      req.db
    );

    res.json({ success: true, data: version });
  } catch (error) {
    console.error("Get version error:", error);
    const statusCode = error.message === "Version not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to get version"
    });
  }
};

// Create named version (checkpoint)
export const createNamedVersion = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { name, description } = req.body;

    console.log("CreateNamedVersion - Params:", { noteId, name, description });

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Version name is required"
      });
    }

    const version = await versionService.createNamedVersion(
      noteId,
      name.trim(),
      description || '',
      req.user.id,
      req.db
    );

    res.status(201).json({ success: true, data: version });
  } catch (error) {
    console.error("Create named version error:", error);
    const statusCode = error.message === "Note not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to create named version"
    });
  }
};

// Create automatic version
export const createAutoVersion = async (req, res) => {
  try {
    const { noteId } = req.params;
    console.log("CreateAutoVersion - Full req.body:", req.body);
    const { triggerType = 'auto', forceCreate = false, timestamp, restoredFrom } = req.body;

    console.log("CreateAutoVersion - Extracted params:", { noteId, triggerType, forceCreate, timestamp, restoredFrom });

    const result = await versionService.createAutoVersion(
      noteId,
      triggerType,
      req.user.id,
      req.db,
      { forceCreate, timestamp, restoredFrom }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Create auto version error:", error);
    const statusCode = error.message === "Note not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to create auto version"
    });
  }
};

// Restore version
export const restoreVersion = async (req, res) => {
  try {
    const { noteId, versionId } = req.params;
    const { createCheckpoint = true } = req.body;

    console.log("RestoreVersion - Params:", { noteId, versionId, createCheckpoint });

    const result = await versionService.restoreVersion(
      noteId,
      versionId,
      createCheckpoint,
      req.user.id,
      req.db
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Restore version error:", error);
    const statusCode = error.message === "Version not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to restore version"
    });
  }
};

// Compare versions
export const compareVersions = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { versionA, versionB } = req.body;

    console.log("CompareVersions - Params:", { noteId, versionA, versionB });

    if (!versionA || !versionB) {
      return res.status(400).json({
        success: false,
        error: "Both versionA and versionB are required"
      });
    }

    const comparison = await versionService.compareVersions(
      noteId,
      versionA,
      versionB,
      req.user.id,
      req.db
    );

    res.json({ success: true, data: comparison });
  } catch (error) {
    console.error("Compare versions error:", error);
    const statusCode = error.message.includes("not found") ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to compare versions"
    });
  }
};

// Get operation history
export const getOperationHistory = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { limit = '100', offset = '0', since, versionId } = req.query;

    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    console.log("GetOperationHistory - Query params:", {
      noteId,
      limit: limitNum,
      offset: offsetNum,
      since,
      versionId
    });

    const operations = await versionService.getOperationHistory(
      noteId,
      req.user.id,
      { limit: limitNum, offset: offsetNum, since, versionId },
      req.db
    );

    res.json({ success: true, data: operations });
  } catch (error) {
    console.error("Get operation history error:", error);
    const statusCode = error.message === "Note not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to get operation history"
    });
  }
};

// Cleanup old versions
export const cleanupVersions = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { keepVersions = 100 } = req.body;

    console.log("CleanupVersions - Params:", { noteId, keepVersions });

    const result = await versionService.cleanupVersions(
      noteId,
      keepVersions,
      req.user.id,
      req.db
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Cleanup versions error:", error);
    const statusCode = error.message === "Note not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to cleanup versions"
    });
  }
};

// Update version name (Google Docs style)
export const updateVersionName = async (req, res) => {
  try {
    const { noteId, versionId } = req.params;
    const { name } = req.body;

    console.log("UpdateVersionName - Params:", { noteId, versionId, name });

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Version name is required"
      });
    }

    const result = await versionService.updateVersionName(
      noteId,
      versionId,
      name.trim(),
      req.user.id,
      req.db
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Update version name error:", error);
    const statusCode = error.message === "Version not found" ? 404 :
                      error.message.includes("permission") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || "Failed to update version name"
    });
  }
};

*/
