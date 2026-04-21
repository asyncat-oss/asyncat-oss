import { sqliteDb } from "../../db/sqlite.js";

/**
 * Get current user's profile
 */
export async function getCurrentUserProfile(req, res) {
  try {
    // Use middleware-provided authentication data
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
    res.status(error.message === "Invalid session" ? 401 : 500).json({
      success: false,
      error: error.message || "Failed to fetch user profile",
    });
  }
}

// Update current user's profile (name and profile picture only)
export async function updateUserProfile(req, res) {
  const { name, profile_picture } = req.body;

  try {
    // Use middleware-provided authentication data
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
    res.status(error.message === "Invalid session" ? 401 : 500).json({
      success: false,
      error: error.message || "Failed to update user profile",
    });
  }
}

/**
 * Get user by ID (public profile info)
 */
export async function getUserById(req, res) {
  const { id } = req.params;

  try {
    // TEMPORARY: Disable internal authentication to test if RLS is the issue
    // Check if this is an internal service call
    // More robust detection: no auth token OR has internal service header
    const hasNoAuth = !req.user; // Check if middleware set user (from JWT)
    const hasInternalHeader = req.headers["x-internal-service"] === "true";
    const isLocalhost =
      req.ip === "127.0.0.1" ||
      req.ip === "::1" ||
      req.connection?.remoteAddress === "127.0.0.1" ||
      req.connection?.remoteAddress === "::1" ||
      req.headers.host?.includes("localhost");

    // TEMPORARILY DISABLE internal call detection
    const isInternalCall = false; // hasInternalHeader || (hasNoSession && isLocalhost);

    console.log(
      `getUserById called for ${id} - Internal: ${isInternalCall}, NoAuth: ${hasNoAuth}, Internal Header: ${hasInternalHeader}, Localhost: ${isLocalhost}`
    );

    // Use req.db if available (authenticated), otherwise fall back to compat singleton
    const db = req.db || sqliteDb;
    console.log("🔍 Using compat client for userId:", id);

    const { data: profile, error } = await db
      .from("users")
      .select("id, name, profile_picture, email") // Include email for internal calls
      .eq("id", id); // Remove .single() to get all matching rows

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    console.log(`Found ${profile?.length || 0} users for ID: ${id}`);

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
    res.status(error.message === "Invalid session" ? 401 : 500).json({
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
    // Use middleware-provided authentication data (might be null for optionalAuth)
    let { user, db } = req;
    
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
    res.status(error.message === "Invalid session" ? 401 : 500).json({
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
    // Use middleware-provided authentication data (might be null for optionalAuth)
    let { user, db } = req;
    
    // If no db client from middleware, use the singleton SQLite client
    if (!db) {
      db = sqliteDb;
    }

    // Search by name or email, excluding the current user (if authenticated)
    let query_builder = db
      .from("users")
      .select("id, name, email, profile_picture")
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`);
    
    // Only exclude current user if we have an authenticated user
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
    res.status(error.message === "Invalid session" ? 401 : 500).json({
      success: false,
      error: error.message || "Failed to search users",
    });
  }
}
