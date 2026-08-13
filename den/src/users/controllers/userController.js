import { sqliteDb } from "../../db/sqlite.js";
import path from 'path';
import fsp from 'fs/promises';
import crypto from 'crypto';

const STORAGE_ROOT = process.env.STORAGE_PATH
  ? path.resolve(process.env.STORAGE_PATH)
  : path.resolve('data', 'uploads');
const PUBLIC_URL_BASE = process.env.PUBLIC_URL || 'http://127.0.0.1:8716';
const PROFILE_PICTURES_DIR = path.join(STORAGE_ROOT, 'profile-pictures');

/**
 * Get current user's profile
 */
export async function getCurrentUserProfile(req, res) {
  try {
    // Use the local profile and database context.
    const { user, db } = req;
    
    // Get user details from the database
    const { data: profile, error } = await db
      .from("users")
      .select("id, email, name, profile_picture, created_at, updated_at")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Fetch user profile error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch user profile",
    });
  }
}

// Update current user's profile (name and profile picture only)
export async function updateUserProfile(req, res) {
  const { name, profile_picture } = req.body;

  try {
    // Use the local profile and database context.
    const { user, db } = req;

    // Make sure we have an update to perform
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (profile_picture !== undefined)
      updateData.profile_picture = profile_picture;

    // Only update if we have data to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid update fields provided",
      });
    }

    // Add the timestamp for update
    updateData.updated_at = new Date();

    // Perform the update - use select().maybeSingle() for safer operation
    const { data: updatedProfile, error: updateError } = await db
      .from("users")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("Update error details:", updateError);
      throw updateError;
    }

    // Check if the update actually affected any rows
    if (!updatedProfile) {
      // Try to get the current user to see if it exists
      const { data: existingUser, error: checkError } = await db
        .from("users")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: "User record not found in database",
        });
      } else {
        return res.status(500).json({
          success: false,
          error: "Update operation did not affect any rows",
        });
      }
    }

    res.json({
      success: true,
      data: updatedProfile,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update user profile",
    });
  }
}

/**
 * Upload a custom profile picture
 */
export async function uploadProfilePicture(req, res) {
  try {
    const { user, db } = req;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    await fsp.mkdir(PROFILE_PICTURES_DIR, { recursive: true });

    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
    const filename = `${user.id}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filePath = path.join(PROFILE_PICTURES_DIR, filename);
    await fsp.writeFile(filePath, req.file.buffer);

    const imageUrl = `${PUBLIC_URL_BASE}/files/profile-pictures/${filename}`;

    // Delete previous custom profile picture if it was a stored file
    const { data: current } = await db.from('users').select('profile_picture').eq('id', user.id).single();
    if (current?.profile_picture && /\/files\/profile-pictures\//.test(current.profile_picture)) {
      const oldFilename = path.basename(current.profile_picture);
      const oldPath = path.join(PROFILE_PICTURES_DIR, oldFilename);
      fsp.unlink(oldPath).catch(() => {});
    }

    const { data: updated, error } = await db
      .from('users')
      .update({ profile_picture: imageUrl, updated_at: new Date() })
      .eq('id', user.id)
      .select()
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, data: updated, url: imageUrl });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to upload profile picture' });
  }
}

/**
 * Delete custom profile picture and revert to default avatar
 */
export async function deleteProfilePicture(req, res) {
  try {
    const { user, db } = req;

    const { data: current } = await db.from('users').select('profile_picture').eq('id', user.id).single();
    if (current?.profile_picture && /\/files\/profile-pictures\//.test(current.profile_picture)) {
      const oldFilename = path.basename(current.profile_picture);
      const oldPath = path.join(PROFILE_PICTURES_DIR, oldFilename);
      fsp.unlink(oldPath).catch(() => {});
    }

    const { data: updated, error } = await db
      .from('users')
      .update({ profile_picture: 'CAT', updated_at: new Date() })
      .eq('id', user.id)
      .select()
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Delete profile picture error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete profile picture' });
  }
}

/**
 * Get user by ID (public profile info)
 */
export async function getUserById(req, res) {
  const { id } = req.params;

  try {
    const db = req.db || sqliteDb;

    const { data: profile, error } = await db
      .from("users")
      .select("id, name, profile_picture, email")
      .eq("id", id);

    if (error) {
      throw error;
    }

    // Handle single result
    if (!profile || profile.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (profile.length > 1) {
      console.warn(`Multiple users found for ID ${id}, using first one`);
    }

    res.json({
      success: true,
      data: profile[0], // Return the first (and hopefully only) user
    });
  } catch (error) {
    console.error("Fetch user by ID error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch user",
    });
  }
}

/**
 * Get multiple users by their IDs
 */
export async function getUsersByIds(req, res) {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Valid user IDs array is required",
    });
  }

  try {
    let { db } = req;
    
    // If no db client from middleware, use the singleton SQLite client
    if (!db) {
      db = sqliteDb;
    }

    const { data: profiles, error } = await db
      .from("users")
      .select("id, name, profile_picture")
      .in("id", ids);

    if (error) throw error;

    res.json({
      success: true,
      data: profiles,
    });
  } catch (error) {
    console.error("Fetch users by IDs error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch users",
    });
  }
}

/**
 * Search users by name or email
 */
export async function searchUsers(req, res) {
  const { query } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: "Search query must be at least 2 characters",
    });
  }

  try {
    let { user, db } = req;
    
    // If no db client from middleware, use the singleton SQLite client
    if (!db) {
      db = sqliteDb;
    }

    // Search by name or email, excluding the local profile.
    let query_builder = db
      .from("users")
      .select("id, name, email, profile_picture")
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`);
    
    // The local profile is always available on req.user.
    if (user) {
      query_builder = query_builder.neq("id", user.id);
    }
    
    const { data: users, error } = await query_builder.limit(20);

    if (error) throw error;

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to search users",
    });
  }
}
