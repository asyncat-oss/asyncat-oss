// versionService.js - Version History Service
// import * as noteService from "./noteService.js";

const versionFeatureDisabled = () => {
  throw new Error("Version history temporarily disabled");
};

export const getVersionHistory = async () => ({
  versions: [],
  totalCount: 0,
  hasMore: false,
});

export const getVersion = async () => null;

export const createNamedVersion = async () => versionFeatureDisabled();

export const createAutoVersion = async () => versionFeatureDisabled();

export const restoreVersion = async () => versionFeatureDisabled();

export const compareVersions = async () => versionFeatureDisabled();

export const trackOperations = async () => {
  // Version history tracking disabled
  return;
};

export const getOperationHistory = async () => [];

export const cleanupVersions = async () => versionFeatureDisabled();

export const updateVersionName = async () => versionFeatureDisabled();

/*

// Get version history for a note
export const getVersionHistory = async (
  noteId,
  userId,
  limit,
  offset,
  majorOnly,
  supabase
) => {
  try {
    console.log("VersionService - getVersionHistory:", {
      noteId,
      userId,
      limit,
      offset,
      majorOnly,
    });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    // Build query
    let query = supabase
      .from("note_versions")
      .select(
        `
        id,
        version_number,
        title,
        content,
        blocks,
        created_by,
        created_at,
        metadata,
        is_major_version,
        parent_version_id,
        size_bytes,
        users:created_by (
          id,
          name,
          email,
          profile_picture
        )
      `
      )
      .eq("note_id", noteId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (majorOnly) {
      query = query.eq("is_major_version", true);
    }

    const { data: versions, error } = await query;

    if (error) {
      console.error("Supabase error in getVersionHistory:", error);
      throw new Error("Failed to fetch version history");
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabase
      .from("note_versions")
      .select("*", { count: "exact", head: true })
      .eq("note_id", noteId);

    if (countError) {
      console.error("Supabase count error:", countError);
    }

    return {
      versions: versions || [],
      totalCount: totalCount || 0,
      hasMore: offset + limit < (totalCount || 0),
    };
  } catch (error) {
    console.error("VersionService - getVersionHistory error:", error);
    throw error;
  }
};

// Get specific version
export const getVersion = async (noteId, versionId, userId, supabase) => {
  try {
    console.log("VersionService - getVersion:", { noteId, versionId, userId });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    const { data: version, error } = await supabase
      .from("note_versions")
      .select(
        `
        *,
        users:created_by (
          id,
          name,
          email,
          profile_picture
        )
      `
      )
      .eq("id", versionId)
      .eq("note_id", noteId)
      .single();

    if (error) {
      console.error("Supabase error in getVersion:", error);
      if (error.code === "PGRST116") {
        throw new Error("Version not found");
      }
      throw new Error("Failed to fetch version");
    }

    return version;
  } catch (error) {
    console.error("VersionService - getVersion error:", error);
    throw error;
  }
};

// Create named version (checkpoint)
export const createNamedVersion = async (
  noteId,
  name,
  description,
  userId,
  supabase
) => {
  try {
    console.log("VersionService - createNamedVersion:", {
      noteId,
      name,
      description,
      userId,
    });

    // Get current note content
    const currentNote = await noteService.getNoteById(noteId, userId, supabase);

    // Extract blocks from metadata if they exist
    let blocks = { blocks: [] }; // Default to empty blocks array structure
    if (currentNote.metadata) {
      const metadata =
        typeof currentNote.metadata === "string"
          ? JSON.parse(currentNote.metadata)
          : currentNote.metadata;

      if (metadata.blocks && Array.isArray(metadata.blocks)) {
        blocks = { blocks: metadata.blocks };
      }
    }

    // Create version snapshot
    const { data: version, error } = await supabase
      .from("note_versions")
      .insert({
        note_id: noteId,
        title: name,
        content: currentNote.content || "",
        blocks: blocks,
        created_by: userId,
        is_major_version: true,
        metadata: {
          description: description,
          checkpoint_name: name,
          created_from: "manual_checkpoint",
          original_title: currentNote.title,
          created_at: new Date().toISOString(),
        },
      })
      .select(
        `
        *,
        users:created_by (
          id,
          name,
          email,
          profile_picture
        )
      `
      )
      .single();

    if (error) {
      console.error("Supabase error in createNamedVersion:", error);
      throw new Error("Failed to create named version");
    }

    return version;
  } catch (error) {
    console.error("VersionService - createNamedVersion error:", error);
    throw error;
  }
};

// Create automatic version
export const createAutoVersion = async (
  noteId,
  triggerType,
  userId,
  supabase,
  options = {}
) => {
  try {
    const { forceCreate = false, timestamp, restoredFrom } = options;
    console.log("VersionService - createAutoVersion:", {
      noteId,
      triggerType,
      userId,
      forceCreate,
      timestamp,
      restoredFrom,
    });
    console.log("Supabase client provided:", !!supabase);
    console.log("Supabase client type:", supabase?.constructor?.name);

    // Get current note content first (needed for both time check and content comparison)
    const currentNote = await noteService.getNoteById(noteId, userId, supabase);

    console.log("Creating version from note:", {
      noteId,
      title: currentNote.title,
      hasContent: !!currentNote.content,
      contentLength: currentNote.content?.length || 0,
      hasMetadata: !!currentNote.metadata,
      metadataHasBlocks: currentNote.metadata?.blocks ? true : false,
      blocksCount: currentNote.metadata?.blocks?.length || 0,
    });

    // Extract current blocks for comparison
    let currentBlocks = { blocks: [] };
    if (currentNote.metadata) {
      const metadata =
        typeof currentNote.metadata === "string"
          ? JSON.parse(currentNote.metadata)
          : currentNote.metadata;

      if (metadata.blocks && Array.isArray(metadata.blocks)) {
        currentBlocks = { blocks: metadata.blocks };
      }
    }

    // Get the last version for comparison
    const { data: lastVersion } = await supabase
      .from("note_versions")
      .select("created_at, title, blocks")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check if content has actually changed compared to the last version
    if (lastVersion && !forceCreate) {
      const titleChanged =
        (currentNote.title || "").trim() !== (lastVersion.title || "").trim();
      const blocksChanged =
        JSON.stringify(currentBlocks) !==
        JSON.stringify(lastVersion.blocks || { blocks: [] });

      if (!titleChanged && !blocksChanged) {
        console.log("Skipping auto version - no content changes detected", {
          currentTitle: currentNote.title,
          lastTitle: lastVersion.title,
          currentBlocksCount: currentBlocks.blocks?.length || 0,
          lastBlocksCount: lastVersion.blocks?.blocks?.length || 0,
        });
        return {
          skipped: true,
          reason: "No content changes",
          lastVersionDate: lastVersion.created_at,
        };
      }

      console.log("Content changes detected:", { titleChanged, blocksChanged });
    }

    // Check if we need to create a version (prevent too frequent versions)
    // Skip this check if forceCreate is true
    if (!forceCreate && lastVersion) {
      // Don't create if last version was less than 2 minutes ago
      const timeDiff = Date.now() - new Date(lastVersion.created_at).getTime();
      if (timeDiff < 2 * 60 * 1000) {
        // 2 minutes
        console.log("Skipping auto version - too recent", {
          timeDiff: Math.round(timeDiff / 1000) + " seconds",
          required: "120 seconds",
        });
        return {
          skipped: true,
          reason: "Too recent",
          lastVersionAge: Math.round(timeDiff / 1000) + " seconds",
        };
      }
    } else if (forceCreate) {
      console.log("Forcing version creation - skipping time check");
    }

    // Get the next version number manually
    const { data: lastVersionData } = await supabase
      .from("note_versions")
      .select("version_number")
      .eq("note_id", noteId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = (lastVersionData?.version_number || 0) + 1;

    // Create auto version
    const versionMetadata = {
      auto_created: true,
      trigger_type: triggerType,
      created_at: new Date().toISOString(),
    };

    // Add optional fields to metadata
    if (timestamp) versionMetadata.restore_timestamp = timestamp;
    if (restoredFrom) versionMetadata.restored_from = restoredFrom;
    if (forceCreate) versionMetadata.forced_creation = true;

    const { data: version, error } = await supabase
      .from("note_versions")
      .insert({
        note_id: noteId,
        version_number: nextVersionNumber,
        title: currentNote.title,
        content: currentNote.content || "",
        blocks: currentBlocks,
        created_by: userId,
        is_major_version: false,
        metadata: versionMetadata,
      })
      .select(
        `
        *,
        users:created_by (
          id,
          name,
          email,
          profile_picture
        )
      `
      )
      .single();

    if (error) {
      console.error(
        "Supabase error in createAutoVersion:",
        JSON.stringify(error, null, 2)
      );
      console.error("Insert data was:", {
        noteId,
        title: currentNote.title,
        blocks: currentBlocks,
        userId,
      });
      throw new Error(
        `Failed to create auto version: ${
          error.message || error.code || "Unknown error"
        }`
      );
    }

    return version;
  } catch (error) {
    console.error("VersionService - createAutoVersion error:", error);
    throw error;
  }
};

// Restore version
export const restoreVersion = async (
  noteId,
  versionId,
  createCheckpoint,
  userId,
  supabase
) => {
  try {
    console.log("VersionService - restoreVersion:", {
      noteId,
      versionId,
      createCheckpoint,
      userId,
    });

    // Get version to restore
    const version = await getVersion(noteId, versionId, userId, supabase);

    // Create checkpoint of current state if requested
    let checkpointCreated = false;
    if (createCheckpoint) {
      try {
        const currentNote = await noteService.getNoteById(
          noteId,
          userId,
          supabase
        );

        // Extract blocks from metadata if they exist
        let blocks = { blocks: [] }; // Default to empty blocks array structure
        if (currentNote.metadata) {
          const metadata =
            typeof currentNote.metadata === "string"
              ? JSON.parse(currentNote.metadata)
              : currentNote.metadata;

          if (metadata.blocks && Array.isArray(metadata.blocks)) {
            blocks = { blocks: metadata.blocks };
          }
        }

        await supabase.from("note_versions").insert({
          note_id: noteId,
          title: `Before restore to v${version.version_number}`,
          content: currentNote.content || "",
          blocks: blocks,
          created_by: userId,
          is_major_version: true,
          metadata: {
            auto_created: true,
            restore_checkpoint: true,
            restored_from_version: version.version_number,
            created_at: new Date().toISOString(),
          },
        });

        checkpointCreated = true;
      } catch (checkpointError) {
        console.warn(
          "Failed to create checkpoint, continuing with restore:",
          checkpointError
        );
      }
    }

    // Extract blocks from version
    let blocksToRestore = null;
    if (version.blocks && typeof version.blocks === "object") {
      if (version.blocks.blocks && Array.isArray(version.blocks.blocks)) {
        blocksToRestore = version.blocks.blocks;
      }
    }

    // Prepare metadata for restored note
    let restoredMetadata = {
      version: 2,
      lastRestoreDate: new Date().toISOString(),
      restoredFrom: {
        versionId: version.id,
        versionNumber: version.version_number,
        originalDate: version.created_at,
      },
    };

    // Include blocks in metadata if we have them
    if (blocksToRestore) {
      restoredMetadata.blocks = blocksToRestore;
    }

    // Update the note with version content
    const { data: updatedNote, error: updateError } = await supabase
      .from("notes")
      .update({
        title: version.title,
        content: version.content,
        metadata: restoredMetadata,
        updatedat: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", noteId)
      .select()
      .single();

    if (updateError) {
      console.error("Supabase error in restoreVersion update:", updateError);
      throw new Error("Failed to restore version");
    }

    return {
      note: updatedNote,
      versionCreated: checkpointCreated,
      restoredFrom: {
        versionId: version.id,
        versionNumber: version.version_number,
        title: version.title,
      },
    };
  } catch (error) {
    console.error("VersionService - restoreVersion error:", error);
    throw error;
  }
};

// Compare versions
export const compareVersions = async (
  noteId,
  versionAId,
  versionBId,
  userId,
  supabase
) => {
  try {
    console.log("VersionService - compareVersions:", {
      noteId,
      versionAId,
      versionBId,
      userId,
    });

    // Get both versions
    const [versionA, versionB] = await Promise.all([
      getVersion(noteId, versionAId, userId, supabase),
      getVersion(noteId, versionBId, userId, supabase),
    ]);

    // Simple diff calculation (you can enhance this with more sophisticated diffing)
    const differences = {
      title: versionA.title !== versionB.title,
      content: versionA.content !== versionB.content,
      blocks:
        JSON.stringify(versionA.blocks) !== JSON.stringify(versionB.blocks),
      createdAt: versionA.created_at !== versionB.created_at,
      createdBy: versionA.created_by !== versionB.created_by,
    };

    // Calculate content length difference
    const contentLengthDiff =
      (versionB.content || "").length - (versionA.content || "").length;

    return {
      versionA: versionA,
      versionB: versionB,
      differences: differences,
      summary: {
        hasChanges: Object.values(differences).some(Boolean),
        changedFields: Object.keys(differences).filter(
          (key) => differences[key]
        ),
        contentLengthDiff: contentLengthDiff,
        timeDiff:
          new Date(versionB.created_at).getTime() -
          new Date(versionA.created_at).getTime(),
      },
    };
  } catch (error) {
    console.error("VersionService - compareVersions error:", error);
    throw error;
  }
};

// Track individual operations for detailed history
export const trackOperations = async (noteId, operations, userId, supabase) => {
  try {
    console.log("VersionService - trackOperations:", {
      noteId,
      operationCount: operations.length,
      userId,
    });

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return { tracked: 0 };
    }

    // Get current version ID if available
    const { data: latestVersion } = await supabase
      .from("note_versions")
      .select("id")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Prepare operations for insertion
    const operationsToInsert = operations.map((operation) => ({
      note_id: noteId,
      version_id: latestVersion?.id || null,
      operation_type: operation.type || "unknown",
      block_id: operation.data?.blockId || null,
      position: operation.data?.position || null,
      content: operation.data?.to || operation.data?.content || null,
      old_content: operation.data?.from || null,
      user_id: userId,
      metadata: {
        operation_data: operation.data,
        timestamp: Date.now(),
      },
    }));

    // Insert operations
    const { data, error } = await supabase
      .from("note_operations")
      .insert(operationsToInsert)
      .select("id");

    if (error) {
      console.error("Supabase error in trackOperations:", error);
      throw new Error("Failed to track operations");
    }

    return {
      tracked: operationsToInsert.length,
      operationIds: data?.map((op) => op.id) || [],
    };
  } catch (error) {
    console.error("VersionService - trackOperations error:", error);
    throw error;
  }
};

// Get operation history for a note
export const getOperationHistory = async (
  noteId,
  userId,
  options = {},
  supabase
) => {
  try {
    const { limit = 100, offset = 0, since, versionId } = options;
    console.log("VersionService - getOperationHistory:", {
      noteId,
      userId,
      limit,
      offset,
      since,
      versionId,
    });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    // Build query
    let query = supabase
      .from("note_operations")
      .select(
        `
        id,
        operation_type,
        block_id,
        position,
        content,
        old_content,
        timestamp,
        metadata,
        version_id,
        users:user_id (
          id,
          name,
          email,
          profile_picture
        )
      `
      )
      .eq("note_id", noteId)
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (since) {
      query = query.gte("timestamp", since);
    }

    if (versionId) {
      query = query.eq("version_id", versionId);
    }

    const { data: operations, error } = await query;

    if (error) {
      console.error("Supabase error in getOperationHistory:", error);
      throw new Error("Failed to fetch operation history");
    }

    return operations || [];
  } catch (error) {
    console.error("VersionService - getOperationHistory error:", error);
    throw error;
  }
};

// Cleanup old versions
export const cleanupVersions = async (
  noteId,
  keepVersions,
  userId,
  supabase
) => {
  try {
    console.log("VersionService - cleanupVersions:", {
      noteId,
      keepVersions,
      userId,
    });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    // Call the cleanup function
    const { data, error } = await supabase.rpc("cleanup_old_versions", {
      p_note_id: noteId,
      p_keep_versions: keepVersions,
    });

    if (error) {
      console.error("Supabase error in cleanupVersions:", error);
      throw new Error("Failed to cleanup versions");
    }

    return {
      deletedCount: data || 0,
      keepVersions: keepVersions,
      noteId: noteId,
    };
  } catch (error) {
    console.error("VersionService - cleanupVersions error:", error);
    throw error;
  }
};

// Update version name (Google Docs style)
export const updateVersionName = async (
  noteId,
  versionId,
  name,
  userId,
  supabase
) => {
  try {
    console.log("VersionService - updateVersionName:", {
      noteId,
      versionId,
      name,
      userId,
    });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    // Get the current version to preserve other metadata
    const { data: currentVersion, error: fetchError } = await supabase
      .from("note_versions")
      .select("metadata")
      .eq("id", versionId)
      .eq("note_id", noteId)
      .single();

    if (fetchError) {
      console.error("Error fetching current version:", fetchError);
      throw new Error("Version not found");
    }

    // Update the metadata with the new checkpoint name
    const updatedMetadata = {
      ...currentVersion.metadata,
      checkpoint_name: name,
    };

    const { data, error } = await supabase
      .from("note_versions")
      .update({
        metadata: updatedMetadata,
      })
      .eq("id", versionId)
      .eq("note_id", noteId)
      .select()
      .single();

    if (error) {
      console.error("Error updating version name:", error);
      throw new Error("Failed to update version name");
    }

    console.log("Version name updated successfully:", { versionId, name });
    return data;
  } catch (error) {
    console.error("VersionService - updateVersionName error:", error);
    throw error;
  }
};

*/
