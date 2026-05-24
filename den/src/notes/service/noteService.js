import { randomUUID } from "crypto";
import { sqliteDb } from "../../db/sqlite.js";

const getSupabase = () => sqliteDb;

// UUID validation helper
const isValidUUID = (uuid) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    uuid
  );
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

const getNotes = async (userId, excludeContent = false, db = null) => {
  try {
    const dbClient = db || getSupabase();

    // Build select columns (no join syntax — compat layer doesn't support it)
    const cols = excludeContent
      ? "id, title, createdby, createdat, updatedat, isstarred, isarchived, metadata"
      : "*";

    let query = dbClient.from("notes").select(cols);

    query = query.eq("createdby", userId);

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

// Create a standalone user-owned note.
const createNote = async (noteData, userId, db = null) => {
  try {
    const { title, content, metadata, conversation_id, agent_session_id } = noteData;
    const dbClient = db || getSupabase();

    const noteToCreate = {
      id: randomUUID(),
      title: title || "Untitled Note",
      content: content || "",
      projectid: null,
      createdby: userId,
      metadata: metadata || {},
      createdat: new Date().toISOString(),
      updatedat: new Date().toISOString(),
      // Track which conversation/session created this note so it can be
      // cleaned up automatically when the conversation is deleted.
      ...(conversation_id ? { conversation_id } : {}),
      ...(agent_session_id ? { agent_session_id } : {}),
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

    if (note.createdby !== userId) {
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

    if (note.createdby !== userId) {
      throw new Error("You do not have permission to update this note");
    }

    delete updates.projectId;
    delete updates.projectid;

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
  db = null
) => {
  return updateNote(id, updates, userId, db);
};

// Enhanced delete note
const deleteNote = async (
  id,
  userId,
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

    if (note.createdby !== userId) {
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

export {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  updateNoteDelta,
  deleteNote,
};
