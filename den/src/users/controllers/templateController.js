// templateController.js - Complete Template Management System - FIXED VERSION
import {
  sanitizeEmoji,
  verifyUser,
  validateProjectEnabledViews,
  getDefaultEnabledViews
} from './project/projectPermissionHelpers.js';

// Get available templates for user/team
async function getTemplates(req, res) {
  try {
    const { user, supabase } = await verifyUser(req);
    const { team_id, category, purpose } = req.query;

    // Build query based on visibility and access
    let query = db
      .from('project_templates')
      .select(`
        id,
        name,
        description,
        category,
        purpose,
        emoji,
        created_by,
        team_id,
        visibility,
        usage_count,
        is_featured,
        created_at,
        updated_at,
        users!created_by (
          id,
          name,
          email
        ),
        teams!team_id (
          id,
          name,
          emoji
        )
      `)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false });

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }
    if (purpose) {
      query = query.eq('purpose', purpose);
    }

    const { data: templates, error } = await query;
    if (error) throw error;

    // Filter templates based on visibility and access
    const filteredTemplates = templates.filter(template => {
      // Public templates are always visible
      if (template.visibility === 'public') return true;
      
      // Private templates only visible to creator
      if (template.visibility === 'private') {
        return template.created_by === user.id;
      }
      
      // Team templates visible to team members
      if (template.visibility === 'team') {
        return template.team_id === team_id || template.created_by === user.id;
      }
      
      return false;
    });

    // Sanitize emojis and format response
    const processedTemplates = filteredTemplates.map(template => ({
      ...template,
      emoji: sanitizeEmoji(template.emoji),
      teams: template.teams ? {
        ...template.teams,
        emoji: sanitizeEmoji(template.teams.emoji)
      } : null
    }));

    res.json({ 
      success: true, 
      data: processedTemplates 
    });

  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch templates'
    });
  }
}

// Get specific template with content
async function getTemplate(req, res) {
  try {
    const { id } = req.params;
    const { user, supabase } = await verifyUser(req);

    // Get template with creator info
    const { data: template, error: templateError } = await supabase
      .from('project_templates')
      .select(`
        *,
        users!created_by (
          id,
          name,
          email
        ),
        teams!team_id (
          id,
          name,
          emoji
        )
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Check access permissions
    const hasAccess = (
      template.visibility === 'public' ||
      (template.visibility === 'private' && template.created_by === user.id) ||
      (template.visibility === 'team' && (template.created_by === user.id || template.team_id))
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this template'
      });
    }

    // Get template content
    const { data: content, error: contentError } = await supabase
      .from('template_content')
      .select('*')
      .eq('template_id', id)
      .order('order_index');

    if (contentError) throw contentError;

    // Organize content by type and hierarchy
    const organizedContent = {
      columns: [],
      cards: [],
      notes: [],
      habits: [],
      settings: []
    };

    content.forEach(item => {
      switch (item.content_type) {
        case 'kanban_column':
          organizedContent.columns.push(item);
          break;
        case 'kanban_card':
          organizedContent.cards.push(item);
          break;
        case 'note':
          organizedContent.notes.push(item);
          break;
        case 'habit':
          organizedContent.habits.push(item);
          break;
        case 'project_settings':
          organizedContent.settings.push(item);
          break;
      }
    });

    res.json({
      success: true,
      data: {
        ...template,
        emoji: sanitizeEmoji(template.emoji),
        content: organizedContent,
        teams: template.teams ? {
          ...template.teams,
          emoji: sanitizeEmoji(template.teams.emoji)
        } : null
      }
    });

  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch template'
    });
  }
}

// Create new template
async function createTemplate(req, res) {
  try {
    const { user, supabase } = await verifyUser(req);
    const {
      name,
      description,
      category = 'custom',
      purpose,
      emoji = '📋',
      team_id,
      visibility = 'private',
      content = []
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Template name is required'
      });
    }

    // Validate visibility
    if (!['private', 'team', 'public'].includes(visibility)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid visibility setting'
      });
    }

    // Team templates require team_id
    if (visibility === 'team' && !team_id) {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required for team templates'
      });
    }

    // Verify user owns the workspace if specified (solo mode)
    if (team_id) {
      const { data: ws } = await supabase
        .from('workspaces')
        .select('owner_id')
        .eq('id', team_id)
        .single();

      if (!ws || ws.owner_id !== user.id) {
        return res.status(403).json({
          success: false,
          error: 'You must be the workspace owner to create workspace templates'
        });
      }
    }

    const validatedEmoji = sanitizeEmoji(emoji);

    // Create template
    const { data: template, error: templateError } = await supabase
      .from('project_templates')
      .insert({
        name: name.trim(),
        description: description?.trim(),
        category,
        purpose,
        emoji: validatedEmoji,
        created_by: user.id,
        team_id: visibility === 'team' ? team_id : null,
        visibility,
        default_enabled_views: getDefaultEnabledViews()
      })
      .select()
      .single();

    if (templateError) throw templateError;

    // Add template content if provided
    if (content && content.length > 0) {
      const contentItems = content.map((item, index) => ({
        template_id: template.id,
        content_type: item.content_type,
        content_data: item.content_data,
        order_index: item.order_index || index,
        parent_id: item.parent_id || null
      }));

      const { error: contentError } = await supabase
        .from('template_content')
        .insert(contentItems);

      if (contentError) {
        console.error('Error adding template content:', contentError);
      }
    }


    res.status(201).json({
      success: true,
      data: {
        ...template,
        emoji: validatedEmoji
      }
    });

  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create template'
    });
  }
}

// Apply template to create new project
async function applyTemplate(req, res) {
  try {
    const { id: templateId } = req.params;
    const { user, supabase } = await verifyUser(req);
    const {
      name,
      description,
      due_date,
      team_id,
      members = []
    } = req.body;

    // Validate required fields
    if (!name || !team_id) {
      return res.status(400).json({
        success: false,
        error: 'Project name and team ID are required'
      });
    }

    // Get template with content
    const { data: template, error: templateError } = await supabase
      .from('project_templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Check template access
    const hasAccess = (
      template.visibility === 'public' ||
      (template.visibility === 'private' && template.created_by === user.id) ||
      (template.visibility === 'team' && template.team_id === team_id)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this template'
      });
    }

    // Verify user owns the workspace (solo mode)
    const { data: wsCheck } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', team_id)
      .single();

    if (!wsCheck || wsCheck.owner_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'You must be the workspace owner to create projects'
      });
    }

    // Create project from template
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        name,
        description: description || template.description,
        due_date: due_date ? new Date(due_date).toISOString() : null,
        team_id,
        created_by: user.id,
        enabled_views: template.default_enabled_views || getDefaultEnabledViews(),
        emoji: template.emoji
      })
      .select()
      .single();

    if (projectError) throw projectError;

    // Single-user mode: no project_members table needed — owner_id on the project is sufficient.

    // Apply template content - THIS IS THE KEY FIX!
    await applyTemplateContent(supabase, templateId, project.id, user.id);

    // Update template usage count
    await supabase
      .from('project_templates')
      .update({ 
        usage_count: template.usage_count + 1,
        updated_at: new Date()
      })
      .eq('id', templateId);


    res.status(201).json({
      success: true,
      data: {
        ...project,
        user_role: 'owner',
        accessible_views: project.enabled_views,
        user_visible_views: project.enabled_views,
        starred: false
      }
    });

  } catch (error) {
    console.error('Apply template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create project from template'
    });
  }
}

// Save existing project as template
async function saveProjectAsTemplate(req, res) {
  try {
    const { id: projectId } = req.params;
    const { user, supabase } = await verifyUser(req);
    const {
      name,
      description,
      visibility = 'private',
      include_content = true
    } = req.body;

    // Validate template name
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Template name is required'
      });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found or access denied'
      });
    }

    // Single-user mode: only the project owner can save as template
    if (project.owner_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Only the project owner can save as template' });
    }

    // Create template
    const { data: template, error: templateError } = await supabase
      .from('project_templates')
      .insert({
        name: name.trim(),
        description: description?.trim() || project.description,
        category: 'custom',
        purpose: null,
        emoji: project.emoji,
        created_by: user.id,
        team_id: visibility === 'team' ? project.team_id : null,
        visibility,
        default_enabled_views: project.enabled_views,
        default_enabled_widgets: project.enabled_widgets
      })
      .select()
      .single();

    if (templateError) throw templateError;

    // Copy project content if requested
    if (include_content) {
      await copyProjectContent(supabase, projectId, template.id);
    }


    res.status(201).json({
      success: true,
      data: template
    });

  } catch (error) {
    console.error('Save project as template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save project as template'
    });
  }
}

// FIXED: Helper function to apply template content to project
// FIXED: Helper function to apply template content to project
async function applyTemplateContent(supabase, templateId, projectId, userId) {
  try {
    console.log(`Applying template content: ${templateId} -> ${projectId}`);
    
    // Get template content
    const { data: content, error: contentError } = await supabase
      .from('template_content')
      .select('*')
      .eq('template_id', templateId)
      .order('order_index');

    if (contentError) {
      console.error('Error fetching template content:', contentError);
      return;
    }

    if (!content || content.length === 0) {
      console.log('No template content found');
      return;
    }

    console.log(`Found ${content.length} template content items`);

    // Create columns first and maintain mapping
    const columnMapping = {}; // Maps original column IDs to new column IDs
    const columnTitleMapping = {}; // Maps column titles to new column IDs
    const columns = content.filter(item => item.content_type === 'kanban_column');
    
    console.log(`Creating ${columns.length} columns`);
    
    for (const columnTemplate of columns) {
      const columnData = columnTemplate.content_data;
      
      try {
        const { data: column, error: columnError } = await supabase
          .schema('kanban')
          .from('Columns')
          .insert({
            title: columnData.title,
            order: columnTemplate.order_index || 0,
            projectId: projectId,
            createdBy: userId,
            isCompletionColumn: columnData.isCompletionColumn || false
          })
          .select()
          .single();

        if (columnError) {
          console.error('Error creating column:', columnError);
          continue;
        }

        if (column) {
          // Map both by original ID and title for flexibility
          if (columnData.id) {
            columnMapping[columnData.id] = column.id;
          }
          columnTitleMapping[columnData.title] = column.id;
          console.log(`Created column: ${columnData.title} -> ${column.id}`);
        }
      } catch (error) {
        console.error('Error in column creation:', error);
      }
    }

    // Create cards
    const cards = content.filter(item => item.content_type === 'kanban_card');
    console.log(`Creating ${cards.length} cards`);
    
    for (const cardTemplate of cards) {
      const cardData = cardTemplate.content_data;
      
      try {
        // Find the correct column ID
        let columnId = null;
        
        // Try multiple ways to find the column
        if (cardData.columnId && columnMapping[cardData.columnId]) {
          columnId = columnMapping[cardData.columnId];
        } else if (cardData.columnTitle && columnTitleMapping[cardData.columnTitle]) {
          columnId = columnTitleMapping[cardData.columnTitle];
        } else {
          // Fallback to first available column
          const availableColumns = Object.values(columnTitleMapping);
          columnId = availableColumns[0];
        }
        
        if (!columnId) {
          console.error('No column found for card:', cardData.title);
          continue;
        }

        const { error: cardError } = await supabase
          .schema('kanban')
          .from('Cards')
          .insert({
            title: cardData.title,
            description: cardData.description || null,
            priority: cardData.priority || 'Medium',
            order: cardTemplate.order_index || 0,
            columnId: columnId,
            tags: cardData.tags || [],
            checklist: cardData.checklist || [],
            createdBy: userId,
            tasks: cardData.tasks || { total: 0, completed: 0 },
            progress: cardData.progress || 0
          });

        if (cardError) {
          console.error('Error creating card:', cardError);
        } else {
          console.log(`Created card: ${cardData.title} in column ${columnId}`);
        }
      } catch (error) {
        console.error('Error in card creation:', error);
      }
    }

    // FIXED: Create notes properly
    const notes = content.filter(item => item.content_type === 'note');
    console.log(`Creating ${notes.length} notes`);
    
    for (const noteTemplate of notes) {
      const noteData = noteTemplate.content_data;
      
      try {
        // First create the note in the notes table
        const { data: note, error: noteError } = await supabase
          .from('notes')
          .insert({
            title: noteData.title,
            content: noteData.content,
            projectid: projectId,  // Note: lowercase 'projectid' as per schema
            createdby: userId,
            metadata: noteData.metadata || {}
          })
          .select()
          .single();

        if (noteError) {
          console.error('Error creating note:', noteError);
          continue;
        }

        // Then create the version entry
        const { error: versionError } = await supabase
          .from('note_versions')
          .insert({
            note_id: note.id,
            title: noteData.title,
            content: noteData.content,
            change_type: 'create',
            created_by: userId,
            metadata: noteData.metadata || {}
          });

        if (versionError) {
          console.error('Error creating note version:', versionError);
        } else {
          console.log(`Created note: ${noteData.title}`);
        }
      } catch (error) {
        console.error('Error in note creation:', error);
      }
    }

    // FIXED: Create habits with correct field name
    const habits = content.filter(item => item.content_type === 'habit');
    console.log(`Creating ${habits.length} habits`);
    
    for (const habitTemplate of habits) {
      const habitData = habitTemplate.content_data;
      
      try {
        const { error: habitError } = await supabase
          .schema('habits')
          .from('habits')
          .insert({
            name: habitData.name,
            description: habitData.description,
            target_value: habitData.target_value || 1,
            unit: habitData.unit || '',
            frequency: habitData.frequency || 'daily',
            project_id: projectId, // FIXED: Use project_id instead of workspace_id
            created_by: userId,
            is_active: true,
            category: habitData.category || 'general',
            color: habitData.color || '#6366f1',
            icon: habitData.icon || '🎯',
            tracking_type: habitData.tracking_type || 'boolean'
          });

        if (habitError) {
          console.error('Error creating habit:', habitError);
        } else {
          console.log(`Created habit: ${habitData.name}`);
        }
      } catch (error) {
        console.error('Error in habit creation:', error);
      }
    }

    console.log('Template content application completed');

  } catch (error) {
    console.error('Error applying template content:', error);
    // Don't throw - template application should succeed even if content fails
  }
}

// FIXED: Helper function to copy project content to template
async function copyProjectContent(supabase, projectId, templateId) {
  try {
    console.log(`Copying project content: ${projectId} -> ${templateId}`);
    const contentItems = [];

    // Copy kanban columns
    const { data: columns, error: columnsError } = await supabase
      .schema('kanban')  // FIXED: Use kanban schema
      .from('Columns')
      .select('*')
      .eq('projectId', projectId)
      .order('order');

    if (columnsError) {
      console.error('Error fetching columns:', columnsError);
    } else if (columns && columns.length > 0) {
      console.log(`Found ${columns.length} columns to copy`);
      
      columns.forEach((column, index) => {
        contentItems.push({
          template_id: templateId,
          content_type: 'kanban_column',
          content_data: {
            id: column.id,  // ADDED: Include original ID for mapping
            title: column.title,
            isCompletionColumn: column.isCompletionColumn
          },
          order_index: index + 1
        });
      });
    }

    // Copy cards (limit to avoid too much data)
    const { data: cards, error: cardsError } = await supabase
      .schema('kanban')  // FIXED: Use kanban schema
      .from('Cards')
      .select(`
        *,
        Columns!columnId (
          id,
          title
        )
      `)
      .eq('Columns.projectId', projectId)
      .order('order')
      .limit(20);  // Increased limit slightly

    if (cardsError) {
      console.error('Error fetching cards:', cardsError);
    } else if (cards && cards.length > 0) {
      console.log(`Found ${cards.length} cards to copy`);
      
      cards.forEach((card, index) => {
        contentItems.push({
          template_id: templateId,
          content_type: 'kanban_card',
          content_data: {
            title: card.title,
            description: card.description,
            priority: card.priority,
            tags: card.tags || [],
            checklist: card.checklist || [],
            tasks: card.tasks || { total: 0, completed: 0 },
            progress: card.progress || 0,
            columnId: card.columnId,  // ADDED: Original column ID
            columnTitle: card.Columns?.title  // Keep title as backup
          },
          order_index: index + 1
        });
      });
    }

    // Copy notes (if linked to projects)
    const { data: notes, error: notesError } = await supabase
      .from('note_versions')
      .select('*')
      .eq('project_id', projectId)  // Assuming notes are linked to projects
      .eq('change_type', 'create')
      .order('created_at', { ascending: false })
      .limit(5);

    if (notesError) {
      console.error('Error fetching notes:', notesError);
    } else if (notes && notes.length > 0) {
      console.log(`Found ${notes.length} notes to copy`);
      
      notes.forEach((note, index) => {
        contentItems.push({
          template_id: templateId,
          content_type: 'note',
          content_data: {
            title: note.title,
            content: note.content
          },
          order_index: index + 1
        });
      });
    }

    // Copy habits (if linked to projects via workspace)
    const { data: habits, error: habitsError } = await supabase
      .schema('habits')
      .from('habits')
      .select('*')
      .eq('workspace_id', projectId)  // Assuming habits are linked via workspace_id
      .eq('is_active', true)
      .limit(10);

    if (habitsError) {
      console.error('Error fetching habits:', habitsError);
    } else if (habits && habits.length > 0) {
      console.log(`Found ${habits.length} habits to copy`);
      
      habits.forEach((habit, index) => {
        contentItems.push({
          template_id: templateId,
          content_type: 'habit',
          content_data: {
            name: habit.name,
            description: habit.description,
            target_value: habit.target_value,
            unit: habit.unit,
            frequency: habit.frequency
          },
          order_index: index + 1
        });
      });
    }

    // Insert all content items
    if (contentItems.length > 0) {
      const { error: insertError } = await supabase
        .from('template_content')
        .insert(contentItems);

      if (insertError) {
        console.error('Error inserting template content:', insertError);
      } else {
        console.log(`Successfully copied ${contentItems.length} content items to template`);
      }
    } else {
      console.log('No content items found to copy');
    }

  } catch (error) {
    console.error('Error copying project content:', error);
    // Don't throw - template creation should succeed even if content copy fails
  }
}

// Update template
async function updateTemplate(req, res) {
  try {
    const { id } = req.params;
    const { user, supabase } = await verifyUser(req);
    const {
      name,
      description,
      purpose,
      emoji,
      visibility
    } = req.body;

    // Get template and verify ownership
    const { data: template, error: templateError } = await supabase
      .from('project_templates')
      .select('*')
      .eq('id', id)
      .eq('created_by', user.id)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or access denied'
      });
    }

    const updateData = { updated_at: new Date() };
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (purpose !== undefined) updateData.purpose = purpose;
    if (emoji) updateData.emoji = sanitizeEmoji(emoji);
    if (visibility && ['private', 'team', 'public'].includes(visibility)) {
      updateData.visibility = visibility;
    }

    const { data: updatedTemplate, error: updateError } = await supabase
      .from('project_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;


    res.json({
      success: true,
      data: updatedTemplate
    });

  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update template'
    });
  }
}

// Delete template
async function deleteTemplate(req, res) {
  try {
    const { id } = req.params;
    const { user, supabase } = await verifyUser(req);

    // Get template and verify ownership
    const { data: template, error: templateError } = await supabase
      .from('project_templates')
      .select('name, created_by')
      .eq('id', id)
      .eq('created_by', user.id)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or access denied'
      });
    }

    // Soft delete by marking as inactive
    const { error: deleteError } = await supabase
      .from('project_templates')
      .update({ 
        is_active: false,
        updated_at: new Date()
      })
      .eq('id', id);

    if (deleteError) throw deleteError;


    res.json({ success: true });

  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete template'
    });
  }
}

export {
  getTemplates,
  getTemplate,
  createTemplate,
  applyTemplate,
  saveProjectAsTemplate,
  updateTemplate,
  deleteTemplate
};