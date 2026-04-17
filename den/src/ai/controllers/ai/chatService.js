// chatService.js - Simplified with Supabase client
import { supabaseCompat as supabase } from '../../../db/compat.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

class ChatService {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes
  }

  // Helper to set RLS context for user
  async setUserContext(userId) {
    try {
      await supabase.rpc('set_user_context', { user_id: userId });
    } catch (error) {
      console.warn('Could not set user context for RLS:', error.message);
    }
  }

  // Helper to get user's current team ID (workspace)
  async getCurrentWorkspaceId(userId, preferredWorkspaceId = null, authenticatedSupabase = null) {
    try {
      // Use authenticated client if provided, otherwise fall back to base client
      const supabaseClient = authenticatedSupabase || supabase;

      await this.setUserContext(userId);

      if (preferredWorkspaceId) {
        // First check if user has access to the preferred workspace using RLS-compatible query
        const { data: ws } = await supabaseClient
          .from('workspaces')
          .select('id')
          .eq('id', preferredWorkspaceId)
          .eq('owner_id', userId)
          .limit(1);

        if (ws && ws.length > 0) {
          return preferredWorkspaceId;
        }
      }

      // Get user's first workspace
      const { data: userWorkspaces, error: wsError } = await supabaseClient
        .from('workspaces')
        .select('id, name, emoji, owner_id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);

      if (wsError) {
        throw new Error(`Workspaces query failed: ${wsError.message}`);
      }

      if (!userWorkspaces || userWorkspaces.length === 0) {
        throw new Error('User has no accessible workspaces');
      }

      return userWorkspaces[0].id;
    } catch (error) {
      throw new Error('Failed to determine team/workspace context');
    }
  }

  // Generate secure public token
  generatePublicToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Helper function to detect if conversation has attachments (images or text files)
  hasAttachments(messages, fileAttachments = null) {
    if (!Array.isArray(messages)) return false;
    
    // Check for file attachments passed separately
    if (fileAttachments && Array.isArray(fileAttachments) && fileAttachments.length > 0) {
      return true;
    }
    
    return messages.some(msg => {
      // Check if message has images property
      if (msg.images && Array.isArray(msg.images) && msg.images.length > 0) {
        return true;
      }
      
      // Check if message is in image mode
      if (msg.imageMode === true) {
        return true;
      }
      
      // Check if message content contains base64 images
      if (typeof msg.content === 'string' && msg.content.includes('base64')) {
        return true;
      }
      
      // Check if message has file attachments
      if (msg.fileAttachments && Array.isArray(msg.fileAttachments) && msg.fileAttachments.length > 0) {
        return true;
      }
      
      return false;
    });
  }



  // Convert frontend messages to simple JSONB format
  convertToJsonbFormat(messages) {
    if (!Array.isArray(messages)) {
      // Invalid input - return empty array
      return [];
    }

    const result = messages.map(msg => {
      const role = msg.type === 'user' ? 'user' : 'cat';
      const baseMessage = {
        [role]: msg.content,
        id: msg.id,
        timestamp: msg.timestamp,
        responseStyle: msg.responseStyle || 'normal'
      };

      // Preserve image data and image mode properties
      if (msg.imageMode === true) {
        baseMessage.imageMode = true;
      }

      if (msg.images && Array.isArray(msg.images) && msg.images.length > 0) {
        baseMessage.images = msg.images;
      }

      if (msg.prompt) {
        baseMessage.prompt = msg.prompt;
      }

      if (msg.isEdit === true) {
        baseMessage.isEdit = true;
      }

      if (msg.suggestions && Array.isArray(msg.suggestions)) {
        baseMessage.suggestions = msg.suggestions;
      }

      // Preserve blocks (chart blocks from AI)
      if (msg.blocks && Array.isArray(msg.blocks)) {
        baseMessage.blocks = msg.blocks;
      }

      // Preserve artifacts (NEW: artifact support)
      if (msg.artifacts && Array.isArray(msg.artifacts)) {
        baseMessage.artifacts = msg.artifacts;
      }

      // Preserve artifact explanation
      if (msg.artifactExplanation) {
        baseMessage.artifactExplanation = msg.artifactExplanation;
      }

      // Preserve tool calls (AI function call results)
      if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
        baseMessage.toolCalls = msg.toolCalls;
      }

      // Preserve web search event (images + sources) so they survive navigation
      if (msg.searchEvent && typeof msg.searchEvent === 'object') {
        baseMessage.searchEvent = msg.searchEvent;
      }

      return baseMessage;
    });

    return result;
  }

  // Convert JSONB format back to frontend format
  convertFromJsonbFormat(jsonbMessages) {
    if (!Array.isArray(jsonbMessages)) return [];
    
    return jsonbMessages.map((msg, index) => {
      const isUser = 'user' in msg;
      const baseMessage = {
        id: msg.id || `msg_${index}`,
        type: isUser ? 'user' : 'assistant',
        role: isUser ? 'user' : 'assistant',
        content: isUser ? msg.user : msg.cat,
        responseStyle: msg.responseStyle || 'normal',
        // Use original timestamp if available, otherwise use a past timestamp to prevent auto-save issues
        timestamp: msg.timestamp || new Date(Date.now() - (60000 * (index + 1))).toISOString()
      };
      
      // Restore image data and image mode properties
      if (msg.imageMode === true) {
        baseMessage.imageMode = true;
      }

      if (msg.images && Array.isArray(msg.images) && msg.images.length > 0) {
        baseMessage.images = msg.images;
      }

      if (msg.prompt) {
        baseMessage.prompt = msg.prompt;
      }

      if (msg.isEdit === true) {
        baseMessage.isEdit = true;
      }

      if (msg.suggestions && Array.isArray(msg.suggestions)) {
        baseMessage.suggestions = msg.suggestions;
      }

      // Restore blocks (chart blocks from AI)
      if (msg.blocks && Array.isArray(msg.blocks)) {
        baseMessage.blocks = msg.blocks;
      }

      // Restore artifacts (NEW: artifact support)
      if (msg.artifacts && Array.isArray(msg.artifacts)) {
        baseMessage.artifacts = msg.artifacts;
      }

      // Restore artifact explanation
      if (msg.artifactExplanation) {
        baseMessage.artifactExplanation = msg.artifactExplanation;
      }

      // Restore tool calls (AI function call results)
      if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
        baseMessage.toolCalls = msg.toolCalls;
      }

      // Restore web search event (images + sources)
      if (msg.searchEvent && typeof msg.searchEvent === 'object') {
        baseMessage.searchEvent = msg.searchEvent;
      }

      return baseMessage;
    });
  }

  // Simplified save conversation using Supabase
  async saveConversation(userId, messages, options = {}) {
    const {
      mode = 'chat',
      projectIds = [],
      title = null,
      metadata = {},
      conversationId = null,
      workspaceId = null,
      fileAttachments = null,
      authenticatedSupabase = null
    } = options;

    // Map visual mode to chat mode for database compatibility
    // Database only accepts 'chat' or 'build', but frontend uses 'visual' for animations
    const dbMode = mode === 'visual' ? 'chat' : mode;

    // Use authenticated client if provided, otherwise fall back to base client
    const supabaseClient = authenticatedSupabase || supabase;

    try {
      // Validation
      if (!userId) throw new Error('User ID is required');
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and cannot be empty');
      }

      await this.setUserContext(userId);
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      let finalConversationId = conversationId;

      // If creating a new conversation, generate ID first
      if (!conversationId) {
        finalConversationId = uuidv4();
      }

      // Convert messages to simple JSONB format
      const jsonbMessages = this.convertToJsonbFormat(messages);

      // Prepare metadata with file attachments
      const enhancedMetadata = { ...metadata };
      if (fileAttachments && Array.isArray(fileAttachments) && fileAttachments.length > 0) {
        enhancedMetadata.fileAttachments = fileAttachments;
      }

      // Detect if conversation has attachments
      const hasAttachments = this.hasAttachments(messages, fileAttachments);

      if (conversationId) {
        // UPDATE existing conversation
        const updateData = {
          messages: jsonbMessages,
          has_attachments: hasAttachments,
          updated_at: new Date().toISOString()
        };

        if (title !== null) updateData.title = title;
        if (enhancedMetadata && Object.keys(enhancedMetadata).length > 0) {
          updateData.metadata = enhancedMetadata;
        }
        if (projectIds.length > 0) updateData.project_ids = projectIds;

        const { data, error } = await supabaseClient
          .schema('aichats')
          .from('conversations')
          .update(updateData)
          .eq('id', conversationId)
          .eq('user_id', userId)
          .eq('workspace_id', effectiveWorkspaceId)
          .select('id, title')
          .single();

        if (error || !data) {
          throw new Error('Conversation not found or access denied');
        }

      } else {
        // CREATE new conversation
        const conversationTitle = title || this.generateTitle(messages[0]?.content || 'New Chat');

        const { error } = await supabaseClient
          .schema('aichats')
          .from('conversations')
          .insert({
            id: finalConversationId,
            user_id: userId,
            workspace_id: effectiveWorkspaceId,
            title: conversationTitle,
            mode: dbMode, // Use mapped mode (visual → chat)
            project_ids: projectIds,
            metadata: enhancedMetadata,
            messages: jsonbMessages,
            has_attachments: hasAttachments,
            last_message_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      // Clear cache for this user and workspace, including the individual conversation cache
      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      this.cache.delete(`conversation_${finalConversationId}_${userId}`);

      return {
        success: true,
        conversationId: finalConversationId,
        title: title,
        workspaceId: effectiveWorkspaceId,
        isNew: !conversationId,
        messageCount: messages.length
      };

    } catch (error) {
      throw new Error(`Failed to save conversation: ${error.message}`);
    }
  }

  // Simplified get conversation using Supabase
  async getConversation(userId, conversationId, workspaceId = null, authenticatedSupabase = null) {
    const cacheKey = `conversation_${conversationId}_${userId}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    // Use authenticated client if provided, otherwise fall back to base client
    const supabaseClient = authenticatedSupabase || supabase;

    try {
      await this.setUserContext(userId);

      // Build query - when loading a specific conversation, don't filter by workspace
      // The conversation's workspace will be returned in the data
      let query = supabaseClient
        .schema('aichats')
        .from('conversations')
        .select(`
          id, title, mode, is_pinned, is_archived, workspace_id,
          last_message_at, created_at, updated_at, has_attachments,
          project_ids, metadata, messages, folder_id,
          is_public, public_token, public_expires_at
        `)
        .eq('id', conversationId)
        .eq('user_id', userId);

      // Only filter by workspace if explicitly provided
      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data: conversation, error } = await query.single();

      if (error || !conversation) {
        throw new Error('Conversation not found');
      }

      // Convert JSONB messages back to frontend format
      const messages = this.convertFromJsonbFormat(conversation.messages || []);

      const data = {
        ...conversation,
        messages,
        metadata: conversation.metadata || {}
      };

      this.setCache(cacheKey, data);
      return data;

    } catch (error) {
      throw new Error(`Failed to retrieve conversation: ${error.message}`);
    }
  }

  // ==========================================
  // PUBLIC CHAT METHODS - NEW
  // ==========================================

  // Make conversation public using Supabase
  async makeConversationPublic(userId, conversationId, expiresIn = null, workspaceId = null) {
    try {
      await this.setUserContext(userId);
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId);

      // First verify user owns this conversation
      const { data: conversation, error } = await supabase
        .schema('aichats')
          .from('conversations')
        .select('id, title, is_public, public_token')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .single();

      if (error || !conversation) {
        throw new Error('Conversation not found or access denied');
      }

      // If already public, return existing token
      if (conversation.is_public && conversation.public_token) {
        return {
          success: true,
          publicToken: conversation.public_token,
          message: 'Conversation is already public'
        };
      }

      // Generate new public token
      const publicToken = this.generatePublicToken();

      // Calculate expiration if provided
      let expiresAt = null;
      if (expiresIn && typeof expiresIn === 'number' && expiresIn > 0) {
        expiresAt = new Date(Date.now() + (expiresIn * 60 * 60 * 1000)).toISOString();
      }

      // Update conversation to be public
      const { data: updated, error: updateError } = await supabase
        .schema('aichats')
          .from('conversations')
        .update({
          is_public: true,
          public_token: publicToken,
          public_expires_at: expiresAt,
          public_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .select('public_token, public_expires_at')
        .single();

      if (updateError || !updated) {
        throw new Error('Failed to make conversation public');
      }

      // Clear cache
      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      this.cache.delete(`conversation_${conversationId}_${userId}`);

      return {
        success: true,
        publicToken: updated.public_token,
        expiresAt: updated.public_expires_at,
        message: 'Conversation made public successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Revoke public access
  async revokePublicAccess(userId, conversationId, workspaceId = null) {
    try {
      // Get effective workspace ID
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId);

      // Update conversation to remove public access
      const { data, error } = await supabase
        .schema('aichats')
        .from('conversations')
        .update({
          is_public: false,
          public_token: null,
          public_expires_at: null,
          public_created_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .select('id')
        .single();

      if (error || !data) {
        throw new Error('Conversation not found or access denied');
      }

      // Clear cache
      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      this.cache.delete(`conversation_${conversationId}_${userId}`);

      return {
        success: true,
        message: 'Public access revoked successfully'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get public conversation (NO USER AUTHENTICATION) - FIXED SQL AMBIGUITY
  async getPublicConversation(publicToken) {
    try {
      if (!publicToken) {
        return {
          success: false,
          error: 'Public token is required'
        };
      }

      // Get conversation by public token using Supabase
      const { data: conversation, error } = await supabase
        .schema('aichats')
        .from('conversations')
        .select(`
          id, title, mode, messages, metadata, has_attachments,
          public_expires_at, created_at, updated_at,
          users!conversations_user_id_fkey(name)
        `)
        .eq('public_token', publicToken)
        .eq('is_public', true)
        .or('public_expires_at.is.null,public_expires_at.gt.' + new Date().toISOString())
        .single();

      if (error || !conversation) {
        return {
          success: false,
          error: 'Public conversation not found or has expired'
        };
      }
      
      // Convert JSONB messages back to frontend format
      const messages = this.convertFromJsonbFormat(conversation.messages || []);

      // Return conversation data (without sensitive info)
      return {
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          mode: conversation.mode,
          messages: messages,
          metadata: conversation.metadata || {},
          authorName: conversation.users?.name,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          isPublic: true
        },
        expiresAt: conversation.public_expires_at
      };

    } catch (error) {
      return {
        success: false,
        error: 'Failed to retrieve public conversation'
      };
    }
  }

  // Get public status for conversation owner
  async getPublicStatus(userId, conversationId, workspaceId = null) {
    try {
      // Get effective workspace ID
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId);

      const { data: conversation, error } = await supabase
        .schema('aichats')
        .from('conversations')
        .select('is_public, public_token, public_expires_at, public_created_at')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .single();

      if (error || !conversation) {
        return {
          success: false,
          error: 'Conversation not found or access denied'
        };
      }

      return {
        success: true,
        isPublic: conversation.is_public || false,
        publicToken: conversation.public_token,
        expiresAt: conversation.public_expires_at,
        publicCreatedAt: conversation.public_created_at
      };

    } catch (error) {
      return {
        success: false,
        error: 'Failed to get public status'
      };
    }
  }

  // Get user's conversations using Supabase
  async getUserConversations(userId, options = {}) {
    const {
      mode = null,
      limit = 50,
      offset = 0,
      includeArchived = false,
      searchTerm = null,
      workspaceId = null,
      authenticatedSupabase = null
    } = options;

    // Use authenticated client if provided, otherwise fall back to base client
    const supabaseClient = authenticatedSupabase || supabase;

    try {
      await this.setUserContext(userId);
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      // Create cache key without the authenticatedSupabase client to avoid circular reference
      const cacheOptions = {
        mode,
        limit,
        offset,
        includeArchived,
        searchTerm
      };
      const cacheKey = `conversations_${userId}_${effectiveWorkspaceId}_${JSON.stringify(cacheOptions)}`;
      const cached = this.getCache(cacheKey);
      if (cached) {
        return cached;
      }

      // Build the query using the appropriate client
      let query = supabaseClient
        .schema('aichats')
        .from('conversations')
        .select(`
          id, title, mode, is_pinned, is_archived, workspace_id,
          message_count, last_message_at, created_at, updated_at, has_attachments,
          project_ids, metadata, is_public, messages, folder_id
        `)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId);

      // Never show trashed conversations in the normal list
      query = query.is('deleted_at', null);

      // Add filters
      if (mode && mode !== 'all') {
        query = query.eq('mode', mode);
      }

      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      if (searchTerm) {
        query = query.or(`title.ilike.%${searchTerm}%,messages.cs."${searchTerm}"`);
      }

      // Order and paginate
      query = query
        .order('is_pinned', { ascending: false })
        .order('last_message_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data: conversations, error } = await query;

      if (error) throw error;

      // Process conversations to extract first/last messages
      const processedConversations = (conversations || []).map(conv => ({
        ...conv,
        first_message: conv.messages?.[0] || null,
        last_message: conv.messages?.[conv.messages?.length - 1] || null,
        messages: undefined // Remove full messages from list view
      }));

      // Get total count using the same client
      let countQuery = supabaseClient
        .schema('aichats')
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId);

      if (!includeArchived) {
        countQuery = countQuery.eq('is_archived', false);
      }

      const { count: total } = await countQuery;

      const data = {
        conversations: processedConversations,
        total: total || 0,
        hasMore: offset + processedConversations.length < (total || 0),
        workspaceId: effectiveWorkspaceId
      };

      this.setCache(cacheKey, data);
      return data;

    } catch (error) {
      throw new Error(`Failed to retrieve conversations: ${error.message}`);
    }
  }

  // Update conversation with workspace validation
  async updateConversation(userId, conversationId, updates, workspaceId = null, authenticatedSupabase = null) {
    try {
      // Use authenticated client if provided, otherwise fall back to base client
      const supabaseClient = authenticatedSupabase || supabase;

      // Get effective workspace ID
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      const allowedFields = ['title', 'is_pinned', 'is_archived', 'metadata'];
      const updateData = { updated_at: new Date().toISOString() };

      for (const [field, value] of Object.entries(updates)) {
        if (allowedFields.includes(field)) {
          updateData[field] = value;
        }
      }

      if (Object.keys(updateData).length === 1) {
        throw new Error('No valid fields to update');
      }

      const { data, error } = await supabaseClient
        .schema('aichats')
        .from('conversations')
        .update(updateData)
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .select('id, title, is_pinned, is_archived')
        .single();

      if (error || !data) {
        throw new Error('Conversation not found or access denied');
      }

      // Clear cache
      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      this.cache.delete(`conversation_${conversationId}_${userId}`);

      return data;

    } catch (error) {
      throw new Error(`Failed to update conversation: ${error.message}`);
    }
  }

  // Delete conversation with workspace validation (also revokes public access)
  // Soft-delete (move to trash)
  async deleteConversation(userId, conversationId, workspaceId = null, authenticatedSupabase = null) {
    try {
      const supabaseClient = authenticatedSupabase || supabase;
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      // First verify the conversation exists and belongs to this user/workspace.
      // We do this as a separate SELECT so the soft-delete UPDATE doesn't have to
      // return a row (the compat layer can't SELECT back after setting deleted_at
      // because the WHERE deleted_at IS NULL condition no longer matches).
      const { data: existing } = await supabaseClient
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .is('deleted_at', null)
        .single();

      if (!existing) {
        throw new Error('Conversation not found or access denied');
      }

      // Soft-delete: set deleted_at without trying to SELECT back
      await supabaseClient
        .from('conversations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_id', userId);

      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      this.cache.delete(`conversation_${conversationId}_${userId}`);

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }
  }

  // Restore from trash
  async restoreConversation(userId, conversationId, workspaceId = null, authenticatedSupabase = null) {
    try {
      const supabaseClient = authenticatedSupabase || supabase;
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      const { data, error } = await supabaseClient
        .schema('aichats')
        .from('conversations')
        .update({ deleted_at: null })
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .not('deleted_at', 'is', null)
        .select('id')
        .single();

      if (error || !data) {
        throw new Error('Conversation not found in trash');
      }

      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to restore conversation: ${error.message}`);
    }
  }

  // Permanent delete (from trash only)
  async permanentDeleteConversation(userId, conversationId, workspaceId = null, authenticatedSupabase = null) {
    try {
      const supabaseClient = authenticatedSupabase || supabase;
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      const { data, error } = await supabaseClient
        .schema('aichats')
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .not('deleted_at', 'is', null)
        .select('id')
        .single();

      if (error || !data) {
        throw new Error('Conversation not found in trash');
      }

      this.cache.delete(`conversation_${conversationId}_${userId}`);
      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to permanently delete conversation: ${error.message}`);
    }
  }

  // Get trashed conversations
  async getTrashConversations(userId, workspaceId = null, authenticatedSupabase = null) {
    try {
      const supabaseClient = authenticatedSupabase || supabase;
      await this.setUserContext(userId);
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      const { data, error } = await supabaseClient
        .schema('aichats')
        .from('conversations')
        .select('id, title, deleted_at, last_message_at, mode')
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new Error(`Failed to get trash: ${error.message}`);
    }
  }

  // Empty trash (permanently delete all trashed conversations)
  async emptyTrash(userId, workspaceId = null, authenticatedSupabase = null) {
    try {
      const supabaseClient = authenticatedSupabase || supabase;
      await this.setUserContext(userId);
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId, authenticatedSupabase);

      const { error } = await supabaseClient
        .schema('aichats')
        .from('conversations')
        .delete()
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .not('deleted_at', 'is', null);

      if (error) throw error;
      this.clearUserWorkspaceCache(userId, effectiveWorkspaceId);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to empty trash: ${error.message}`);
    }
  }

  // Auto-save helper with workspace context
  async autoSaveSession(userId, messages, currentConversationId, options = {}) {
    if (messages.length < 2) return null;

    try {
      return await this.saveConversation(userId, messages, {
        ...options,
        conversationId: currentConversationId
      });
    } catch (error) {
      console.warn('Auto-save failed:', error);
      return null;
    }
  }

  // Simple title generation
  generateTitle(firstMessage) {
    if (!firstMessage) return 'New Chat';
    const clean = firstMessage.trim();
    return clean.length <= 50 ? clean : clean.substring(0, 47) + '...';
  }

  // Get conversation statistics for a workspace
  async getConversationStats(userId, workspaceId = null) {
    try {
      // Get effective workspace ID
      const effectiveWorkspaceId = await this.getCurrentWorkspaceId(userId, workspaceId);

      // Note: This is a complex aggregation query that might need to be split up for Supabase
      // For now, let's use a simpler approach and calculate stats on the client side
      const { data: conversations, error } = await supabase
        .schema('aichats')
        .from('conversations')
        .select('mode, is_pinned, is_public, message_count, last_message_at')
        .eq('user_id', userId)
        .eq('workspace_id', effectiveWorkspaceId)
        .eq('is_archived', false);

      if (error) {
        // Error getting stats - return default values
        throw error;
      }

      const stats = {
        total_conversations: conversations.length,
        chat_conversations: conversations.filter(c => c.mode === 'chat').length,
        build_conversations: conversations.filter(c => c.mode === 'build').length,
        pinned_conversations: conversations.filter(c => c.is_pinned).length,
        public_conversations: conversations.filter(c => c.is_public).length,
        total_messages: conversations.reduce((sum, c) => sum + (c.message_count || 0), 0),
        last_activity: conversations.reduce((latest, c) => {
          const messageTime = new Date(c.last_message_at || 0);
          const latestTime = new Date(latest || 0);
          return messageTime > latestTime ? c.last_message_at : latest;
        }, null)
      };

      return {
        totalConversations: parseInt(stats.total_conversations || 0),
        chatConversations: parseInt(stats.chat_conversations || 0),
        buildConversations: parseInt(stats.build_conversations || 0),
        pinnedConversations: parseInt(stats.pinned_conversations || 0),
        publicConversations: parseInt(stats.public_conversations || 0),
        totalMessages: parseInt(stats.total_messages || 0),
        lastActivity: stats.last_activity,
        workspaceId: effectiveWorkspaceId
      };

    } catch (error) {
      return {
        totalConversations: 0,
        chatConversations: 0,
        buildConversations: 0,
        pinnedConversations: 0,
        publicConversations: 0,
        totalMessages: 0,
        lastActivity: null,
        workspaceId: null
      };
    }
  }

  // Get all workspaces where user has conversations
  async getUserConversationWorkspaces(userId) {
    try {
      // This is a complex join query - we'll need to fetch data separately and combine
      const { data: conversations, error: convError } = await supabase
        .schema('aichats')
        .from('conversations')
        .select('workspace_id, is_public, last_message_at')
        .eq('user_id', userId)
        .eq('is_archived', false);

      if (convError) {
        return [];
      }

      // Group conversations by workspace
      const workspaceStats = {};
      conversations.forEach(conv => {
        const wsId = conv.workspace_id;
        if (!workspaceStats[wsId]) {
          workspaceStats[wsId] = {
            conversation_count: 0,
            public_conversation_count: 0,
            last_activity: null
          };
        }
        workspaceStats[wsId].conversation_count++;
        if (conv.is_public) {
          workspaceStats[wsId].public_conversation_count++;
        }
        if (!workspaceStats[wsId].last_activity || conv.last_message_at > workspaceStats[wsId].last_activity) {
          workspaceStats[wsId].last_activity = conv.last_message_at;
        }
      });

      // Get team details for each workspace that has conversations
      const workspaceIds = Object.keys(workspaceStats);
      if (workspaceIds.length === 0) return [];

      const { data: workspaceList, error: wsError } = await supabase
        .from('workspaces')
        .select('id, name, emoji')
        .in('id', workspaceIds);

      if (wsError) {
        return [];
      }

      // Combine workspace details with conversation stats
      const result = (workspaceList || []).map(team => ({
        workspace_id: team.id,
        workspace_name: team.name,
        workspace_emoji: team.emoji,
        conversation_count: workspaceStats[team.id].conversation_count,
        public_conversation_count: workspaceStats[team.id].public_conversation_count,
        last_activity: workspaceStats[team.id].last_activity
      }));

      // Sort by last activity
      result.sort((a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0));

      return result;
    } catch (error) {
      return [];
    }
  }

  // Cache management
  setCache(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl
    });
  }

  getCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expires) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  clearUserWorkspaceCache(userId, workspaceId) {
    for (const key of this.cache.keys()) {
      if (key.includes(`_${userId}_${workspaceId}_`) || 
          key.includes(`conversations_${userId}_${workspaceId}`)) {
        this.cache.delete(key);
      }
    }
  }
}

export const chatService = new ChatService();
export default chatService;