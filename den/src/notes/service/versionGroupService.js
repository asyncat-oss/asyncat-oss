// versionGroupService.js - Service for managing version group names
// import * as noteService from "./noteService.js";

const disabledResponse = () => {
  throw new Error("Version history temporarily disabled");
};

export const getGroupNames = async () => ({});

export const updateGroupName = async () => disabledResponse();

export const deleteGroupName = async () => disabledResponse();

/*

// Get all group names for a note
export const getGroupNames = async (noteId, userId, supabase) => {
  try {
    console.log("VersionGroupService - getGroupNames:", { noteId, userId });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    const { data, error } = await supabase
      .from("note_version_groups")
      .select("group_key, name, created_at, updated_at")
      .eq("note_id", noteId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Supabase error in getGroupNames:", error);
      throw new Error("Failed to fetch group names");
    }

    // Convert array to object keyed by group_key for easier frontend consumption
    const groupNamesMap = {};
    (data || []).forEach((item) => {
      groupNamesMap[item.group_key] = item.name;
    });

    return groupNamesMap;
  } catch (error) {
    console.error("VersionGroupService - getGroupNames error:", error);
    throw error;
  }
};

// Update or create a group name
export const updateGroupName = async (
  noteId,
  groupKey,
  name,
  userId,
  supabase
) => {
  try {
    console.log("VersionGroupService - updateGroupName:", {
      noteId,
      groupKey,
      name,
      userId,
    });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    // Validate group key format (should be like "2025-9-group-0")
    if (!groupKey || typeof groupKey !== "string") {
      throw new Error("Invalid group key");
    }

    // Validate name
    if (!name || name.length > 255) {
      throw new Error("Invalid group name length");
    }

    // Upsert the group name
    const { data, error } = await supabase
      .from("note_version_groups")
      .upsert(
        {
          note_id: noteId,
          group_key: groupKey,
          name: name,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "note_id,group_key",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Supabase error in updateGroupName:", error);
      throw new Error("Failed to update group name");
    }

    return {
      groupKey: data.group_key,
      name: data.name,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("VersionGroupService - updateGroupName error:", error);
    throw error;
  }
};

// Delete a group name
export const deleteGroupName = async (noteId, groupKey, userId, supabase) => {
  try {
    console.log("VersionGroupService - deleteGroupName:", {
      noteId,
      groupKey,
      userId,
    });

    // First check if user has access to this note
    await noteService.getNoteById(noteId, userId, supabase);

    const { error } = await supabase
      .from("note_version_groups")
      .delete()
      .eq("note_id", noteId)
      .eq("group_key", groupKey);

    if (error) {
      console.error("Supabase error in deleteGroupName:", error);
      throw new Error("Failed to delete group name");
    }

    return { success: true };
  } catch (error) {
    console.error("VersionGroupService - deleteGroupName error:", error);
    throw error;
  }
};

*/
