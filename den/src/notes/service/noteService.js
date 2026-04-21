import { randomUUID } from "crypto";
import { getSupabase } from "../config/supabase.js";

// UUID validation helper
const isValidUUID = (uuid) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    uuid
  );
};

/**
 * Single-user access check: verify the project belongs to the requesting user.
 * Replaces the old project_members-based checkProjectAccess.
 */
const checkProjectAccess = async (projectId, userId, _role = null, db = null) => {
  try {
    const dbClient = db || getSupabase();
    const { data: project, error } = await dbClient
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .single();

    if (error || !project) return false;
    return project.owner_id === userId;
  } catch (err) {
    console.error("Project access check error:", err);
    return false;
  }
};

// Helper to get user's project IDs (projects owned by the user)
const getUserProjectIds = async (userId, db = null) => {
  try {
    const dbClient = db || getSupabase();
    const { data, error } = await dbClient
      .from("projects")
      .select("id")
      .eq("owner_id", userId);

    if (error) {
      console.error("Error getting user project IDs:", error);
      return [];
    }
    return (data || []).map((row) => row.id);
  } catch (error) {
    console.error("Error getting user project IDs:", error);
    return [];
  }
};

// Helper to fetch user info by id (replaces Supabase join syntax)
const getUserById = async (userId, db = null) => {
  if (!userId) return null;
  try {
    const dbClient = db || getSupabase();
    const { data } = await dbClient
      .from("users")
      .select("id, name, email, profile_picture")
      .eq("id", userId)
      .single();
    return data || null;
  } catch {
    return null;
  }
};

// Attach creator user info to a note (replaces join syntax)
const attachCreator = async (note, db) => {
  if (!note) return note;
  const creator = await getUserById(note.createdby, db);
  return { ...note, users: creator };
};

// Attach creator user info to multiple notes
const attachCreators = async (notes, db) => {
  if (!notes || notes.length === 0) return notes;
  // Collect unique creator IDs
  const creatorIds = [...new Set(notes.map((n) => n.createdby).filter(Boolean))];
  if (creatorIds.length === 0) return notes.map((n) => ({ ...n, users: null }));

  const dbClient = db || getSupabase();
  const { data: users } = await dbClient
    .from("users")
    .select("id, name, email, profile_picture")
    .in("id", creatorIds);

  const userMap = (users || []).reduce((acc, u) => { acc[u.id] = u; return acc; }, {});
  return notes.map((n) => ({ ...n, users: userMap[n.createdby] || null }));
};

// Enhanced get notes with proper project handling
const getNotes = async (
  userId,
  projectId = null,
  excludeContent = false,
  db = null
) => {
  try {
    const dbClient = db || getSupabase();

    // Build select columns (no join syntax — compat layer doesn't support it)
    const cols = excludeContent
      ? "id, title, projectid, createdby, createdat, updatedat, isstarred, isarchived, metadata"
      : "*";

    let query = dbClient.from("notes").select(cols);

    if (projectId === "all") {
      const userProjectIds = await getUserProjectIds(userId, dbClient);
      if (userProjectIds.length === 0) {
        query = query.eq("createdby", userId);
      } else {
        query = query.or(
          `createdby.eq.${userId},projectid.in.(${userProjectIds.join(",")})`
        );
      }
    } else if (!projectId) {
      query = query.eq("createdby", userId);
    } else {
      if (!isValidUUID(projectId)) {
        throw new Error("Invalid project ID format");
      }

      const hasAccess = await checkProjectAccess(projectId, userId, null, dbClient);
      if (!hasAccess) {
        throw new Error("You do not have permission to access notes for this project");
      }

      query = query.eq("projectid", projectId);
    }

    const { data: notes, error } = await query.order("updatedat", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch notes: ${error.message}`);
    }

    // Attach creator info separately (compat layer has no join support)
    return await attachCreators(notes || [], dbClient);
  } catch (error) {
    throw error;
  }
};

// Enhanced create note with proper project handling
const createNote = async (noteData, userId, db = null) => {
  try {
    const { title, content, projectId, metadata } = noteData;

    if (!projectId) {
      throw new Error("Project ID is required");
    }

    if (!isValidUUID(projectId)) {
      throw new Error("Invalid project ID format");
    }

    const dbClient = db || getSupabase();
    const hasAccess = await checkProjectAccess(projectId, userId, null, dbClient);
    if (!hasAccess) {
      throw new Error("You do not have permission to create notes in this project");
    }

    const noteToCreate = {
      id: randomUUID(),
      title: title || "Untitled Note",
      content: content || "",
      projectid: projectId,
      createdby: userId,
      metadata: metadata || {},
      createdat: new Date().toISOString(),
      updatedat: new Date().toISOString(),
    };

    const { data: newNote, error } = await dbClient
      .from("notes")
      .insert([noteToCreate])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create note: ${error.message}`);
    }

    return await attachCreator(newNote, dbClient);
  } catch (error) {
    throw error;
  }
};

// Get note by ID with improved error handling
const getNoteById = async (id, userId, db = null) => {
  try {
    if (!isValidUUID(id)) {
      throw new Error("Invalid note ID format");
    }

    const dbClient = db || getSupabase();
    const { data: note, error } = await dbClient
      .from("notes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Note not found");
      }
      throw new Error(`Failed to fetch note: ${error.message}`);
    }

    if (!note) {
      throw new Error("Note not found");
    }

    // Single-user: check project ownership
    const hasAccess = await checkProjectAccess(note.projectid, userId, null, dbClient);
    if (!hasAccess) {
      throw new Error("You do not have permission to access this note");
    }

    return await attachCreator(note, dbClient);
  } catch (error) {
    throw error;
  }
};

// Simplified update note
const updateNote = async (
  id,
  updates,
  userId,
  blobServiceClient = null,
  db = null
) => {
  try {
    if (!isValidUUID(id)) {
      throw new Error("Invalid note ID format");
    }

    const dbClient = db || getSupabase();

    // Fetch existing note
    const { data: note, error: fetchError } = await dbClient
      .from("notes")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") throw new Error("Note not found");
      throw new Error(`Failed to fetch note: ${fetchError.message}`);
    }

    if (!note) throw new Error("Note not found");

    // Single-user: check project ownership
    const hasAccess = await checkProjectAccess(note.projectid, userId, null, dbClient);
    if (!hasAccess) {
      throw new Error("You do not have permission to update this note");
    }

    // Handle projectId updates
    if ("projectId" in updates) {
      if (!updates.projectId) {
        throw new Error("Project ID is required and cannot be empty");
      } else if (isValidUUID(updates.projectId)) {
        const targetAccess = await checkProjectAccess(updates.projectId, userId, null, dbClient);
        if (!targetAccess) {
          throw new Error("You do not have permission to move note to this project");
        }
        updates.projectid = updates.projectId;
      } else {
        throw new Error("Invalid project ID format");
      }
      delete updates.projectId;
    }

    // Handle camelCase to snake_case conversions
    if ("isStarred" in updates) {
      updates.isstarred = updates.isStarred;
      delete updates.isStarred;
    }

    if ("isArchived" in updates) {
      updates.isarchived = updates.isArchived;
      delete updates.isArchived;
    }

    // Handle metadata JSON parsing
    if ("metadata" in updates && typeof updates.metadata === "string") {
      try {
        updates.metadata = JSON.parse(updates.metadata);
      } catch (e) {
        console.warn("Invalid metadata JSON, keeping as string");
      }
    }

    // Perform the update
    const { data: updatedNote, error: updateError } = await dbClient
      .from("notes")
      .update({
        ...updates,
        updatedat: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update note: ${updateError.message}`);
    }

    if (!updatedNote) {
      throw new Error("Note update failed - possible concurrent modification");
    }

    return await attachCreator(updatedNote, dbClient);
  } catch (error) {
    throw error;
  }
};

// Add updateNoteDelta function for delta operations
const updateNoteDelta = async (
  id,
  updates,
  userId,
  blobServiceClient = null,
  db = null
) => {
  return updateNote(id, updates, userId, blobServiceClient, db);
};

// Enhanced delete note
const deleteNote = async (
  id,
  userId,
  blobServiceClient = null,
  db = null
) => {
  try {
    if (!isValidUUID(id)) {
      throw new Error("Invalid note ID format");
    }

    const dbClient = db || getSupabase();

    const { data: note, error: fetchError } = await dbClient
      .from("notes")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") throw new Error("Note not found");
      throw new Error(`Failed to fetch note: ${fetchError.message}`);
    }

    if (!note) throw new Error("Note not found");

    // Single-user: check project ownership
    const hasAccess = await checkProjectAccess(note.projectid, userId, null, dbClient);
    if (!hasAccess) {
      throw new Error("You do not have permission to delete this note");
    }

    const { error: deleteError } = await dbClient
      .from("notes")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw new Error(`Failed to delete note: ${deleteError.message}`);
    }

    return note;
  } catch (error) {
    throw error;
  }
};

const calculateWordCount = (content) => {
  if (!content) return 0;
  const plainText = content.replace(/<[^>]*>/g, "");
  return plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
};

export {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  updateNoteDelta,
  deleteNote,
};
