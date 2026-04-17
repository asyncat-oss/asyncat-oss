// projectComponentController.js - Cleaned Version (deprecated views removed)
import {
  hasPermission,
  verifyUser
} from './projectPermissionHelpers.js';

// CLEANED: Define component data mappings - removed activities only
const COMPONENT_DATA_MAPPING = {
  kanban: {
    tables: ['kanban.Columns', 'kanban.Cards', 'kanban.TaskDependencies', 'kanban.TimeEntries'],
    description: 'All kanban boards, columns, cards, and related data',
    requiresOwner: true
  },
  notes: {
    tables: ['notes'],
    description: 'All project notes and documentation',
    requiresOwner: true
  },
  habits: {
    tables: [
      'habits.habits',
      'habits.habit_completions',
      'habits.habit_streaks'
    ],
    description: 'All habits, completion records, and streak data',
    requiresOwner: true
  },
  timeline: {
    tables: ['Events'],
    description: 'All timeline events and milestones',
    requiresOwner: true
  }
};

// Helper function to get filtered count for a table
const getTableCount = async (supabase, tableName, projectId, userId, requiresOwner) => {
  try {
    let query;
    
    if (tableName.includes('.')) {
      const [schemaName, tableBaseName] = tableName.split('.');
      query = supabase.schema(schemaName).from(tableBaseName).select('*', { count: 'exact', head: true });
      
      // Apply filters based on schema and table
      switch (schemaName) {
        case 'kanban':
          if (tableBaseName === 'Columns') {
            query = query.eq('projectId', projectId);
          } else if (tableBaseName === 'Cards') {
            // Get cards that belong to columns in this project
            const { data: projectColumns } = await supabase
              .schema('kanban')
              .from('Columns')
              .select('id')
              .eq('projectId', projectId);
            
            if (projectColumns && projectColumns.length > 0) {
              const columnIds = projectColumns.map(col => col.id);
              query = query.in('columnId', columnIds);
            } else {
              return 0; // No columns = no cards
            }
          } else if (tableBaseName === 'TaskDependencies') {
            // Get dependencies for cards in this project
            const { data: projectCards } = await supabase
              .schema('kanban')
              .from('Cards')
              .select('id, columnId')
              .in('columnId', (await supabase.from('Columns').select('id').eq('projectId', projectId)).data?.map(c => c.id) || []);
            
            if (projectCards && projectCards.length > 0) {
              const cardIds = projectCards.map(card => card.id);
              query = query.or(`sourceCardId.in.(${cardIds.join(',')}),targetCardId.in.(${cardIds.join(',')})`);
            } else {
              return 0;
            }
          } else if (tableBaseName === 'TimeEntries') {
            // Get time entries for cards in this project
            const { data: projectCards } = await supabase
              .schema('kanban')
              .from('Cards')
              .select('id, columnId')
              .in('columnId', (await supabase.from('Columns').select('id').eq('projectId', projectId)).data?.map(c => c.id) || []);
            
            if (projectCards && projectCards.length > 0) {
              const cardIds = projectCards.map(card => card.id);
              query = query.in('cardId', cardIds);
            } else {
              return 0;
            }
          }
          break;
          
        case 'habits':
          if (tableBaseName === 'habits') {
            query = query.eq('project_id', projectId);
          } else if (['habit_completions', 'habit_streaks'].includes(tableBaseName)) {
            // Get habits for this project first
            const { data: projectHabits } = await supabase
              .schema('habits')
              .from('habits')
              .select('id')
              .eq('project_id', projectId);
            
            if (projectHabits && projectHabits.length > 0) {
              const habitIds = projectHabits.map(habit => habit.id);
              query = query.in('habit_id', habitIds);
            } else {
              return 0;
            }
          }
          break;
          
      }
    } else {
      // Public schema tables
      query = supabase.from(tableName).select('*', { count: 'exact', head: true });
      
      if (tableName === 'notes') {
        query = query.eq('projectid', projectId);
      } else if (tableName === 'Events') {
        query = query.eq('projectId', projectId);
      }
    }
    
    const { count, error } = await query;
    if (error) {
      console.warn(`Error counting ${tableName}:`, error);
      return 0;
    }
    
    return count || 0;
  } catch (err) {
    console.warn(`Error processing ${tableName}:`, err);
    return 0;
  }
};

// Helper function to delete data from a table with proper filtering
const deleteTableData = async (supabase, tableName, projectId, userId, requiresOwner) => {
  try {
    let preCount = 0;
    let deletedCount = 0;
    
    if (tableName.includes('.')) {
      const [schemaName, tableBaseName] = tableName.split('.');
      
      // Get count first
      preCount = await getTableCount(supabase, tableName, projectId, userId, requiresOwner);
      
      if (preCount === 0) {
        return { success: true, preCount: 0, deletedCount: 0 };
      }
      
      let deleteQuery = supabase.schema(schemaName).from(tableBaseName).delete();
      
      // Apply same filters as count function
      switch (schemaName) {
        case 'kanban':
          if (tableBaseName === 'Columns') {
            deleteQuery = deleteQuery.eq('projectId', projectId);
          } else if (tableBaseName === 'Cards') {
            const { data: projectColumns } = await supabase
              .schema('kanban')
              .from('Columns')
              .select('id')
              .eq('projectId', projectId);
            
            if (projectColumns && projectColumns.length > 0) {
              const columnIds = projectColumns.map(col => col.id);
              deleteQuery = deleteQuery.in('columnId', columnIds);
            } else {
              return { success: true, preCount, deletedCount: 0 };
            }
          } else if (tableBaseName === 'TaskDependencies') {
            const { data: projectCards } = await supabase
              .schema('kanban')
              .from('Cards')
              .select('id, columnId')
              .in('columnId', (await supabase.from('Columns').select('id').eq('projectId', projectId)).data?.map(c => c.id) || []);
            
            if (projectCards && projectCards.length > 0) {
              const cardIds = projectCards.map(card => card.id);
              deleteQuery = deleteQuery.or(`sourceCardId.in.(${cardIds.join(',')}),targetCardId.in.(${cardIds.join(',')})`);
            } else {
              return { success: true, preCount, deletedCount: 0 };
            }
          } else if (tableBaseName === 'TimeEntries') {
            const { data: projectCards } = await supabase
              .schema('kanban')
              .from('Cards')
              .select('id, columnId')
              .in('columnId', (await supabase.from('Columns').select('id').eq('projectId', projectId)).data?.map(c => c.id) || []);
            
            if (projectCards && projectCards.length > 0) {
              const cardIds = projectCards.map(card => card.id);
              deleteQuery = deleteQuery.in('cardId', cardIds);
            } else {
              return { success: true, preCount, deletedCount: 0 };
            }
          }
          break;
          
        case 'habits':
          if (tableBaseName === 'habits') {
            deleteQuery = deleteQuery.eq('project_id', projectId);
          } else if (['habit_completions', 'habit_streaks'].includes(tableBaseName)) {
            const { data: projectHabits } = await supabase
              .schema('habits')
              .from('habits')
              .select('id')
              .eq('project_id', projectId);
            
            if (projectHabits && projectHabits.length > 0) {
              const habitIds = projectHabits.map(habit => habit.id);
              deleteQuery = deleteQuery.in('habit_id', habitIds);
            } else {
              return { success: true, preCount, deletedCount: 0 };
            }
          }
          break;
          
      }
      
      const { error: deleteError, count } = await deleteQuery;
      deletedCount = count || 0;
      
      if (deleteError) {
        return { success: false, error: deleteError.message, preCount, deletedCount: 0 };
      }
    } else {
      // Public schema tables
      preCount = await getTableCount(supabase, tableName, projectId, userId, requiresOwner);
      
      if (preCount === 0) {
        return { success: true, preCount: 0, deletedCount: 0 };
      }
      
      let deleteQuery = supabase.from(tableName).delete();
      
      if (tableName === 'notes') {
        deleteQuery = deleteQuery.eq('projectid', projectId);
      } else if (tableName === 'Events') {
        deleteQuery = deleteQuery.eq('projectId', projectId);
      }
      
      const { error: deleteError, count } = await deleteQuery;
      deletedCount = count || 0;
      
      if (deleteError) {
        return { success: false, error: deleteError.message, preCount, deletedCount: 0 };
      }
    }
    
    return { success: true, preCount, deletedCount };
  } catch (err) {
    return { success: false, error: err.message, preCount: 0, deletedCount: 0 };
  }
};

// Get component data summary (before deletion)
async function getComponentDataSummary(req, res) {
  try {
    const { id: projectId, componentName } = req.params;
    const { user, supabase } = await verifyUser(req);

    // Check if user has permission to view this data
    const hasViewPermission = await hasPermission(supabase, projectId, user.id, 'canViewContent');
    if (!hasViewPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view component data'
      });
    }

    // Validate component
    const componentConfig = COMPONENT_DATA_MAPPING[componentName];
    if (!componentConfig) {
      return res.status(400).json({
        success: false,
        error: `Unknown component: ${componentName}`
      });
    }

    // Get data counts for each table
    const summary = {
      component: componentName,
      description: componentConfig.description,
      requiresOwner: componentConfig.requiresOwner,
      tables: {},
      totalRecords: 0
    };

    for (const tableName of componentConfig.tables) {
      const count = await getTableCount(supabase, tableName, projectId, user.id, componentConfig.requiresOwner);
      summary.tables[tableName] = { count };
      summary.totalRecords += count;
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get component summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get component data summary'
    });
  }
}

// Wipe component data
async function wipeComponentData(req, res) {
  try {
    const { id: projectId, componentName } = req.params;
    const { confirmationText, userAcknowledgment } = req.body;
    const { user, supabase } = await verifyUser(req);

    // Validate component
    const componentConfig = COMPONENT_DATA_MAPPING[componentName];
    if (!componentConfig) {
      return res.status(400).json({
        success: false,
        error: `Unknown component: ${componentName}`
      });
    }

    // Check permissions
    let hasWipePermission = false;
    if (componentConfig.requiresOwner) {
      // Requires owner permission
      hasWipePermission = await hasPermission(supabase, projectId, user.id, 'canDeleteProject');
    } else {
      // Personal data - user can delete their own
      hasWipePermission = await hasPermission(supabase, projectId, user.id, 'canViewContent');
    }

    if (!hasWipePermission) {
      return res.status(403).json({
        success: false,
        error: componentConfig.requiresOwner 
          ? 'Only project owners can wipe component data'
          : 'You do not have permission to wipe this component data'
      });
    }

    // Validate confirmation
    const expectedConfirmation = `DELETE ${componentName.toUpperCase()} DATA`;
    if (confirmationText !== expectedConfirmation) {
      return res.status(400).json({
        success: false,
        error: `Confirmation text must be exactly: ${expectedConfirmation}`
      });
    }

    if (!userAcknowledgment) {
      return res.status(400).json({
        success: false,
        error: 'User must acknowledge the permanent nature of this action'
      });
    }

    // Get project name for logging
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();

    if (projectError) throw projectError;

    // Get pre-deletion summary
    const preDeletionSummary = {};
    const deletionResults = {};

    // Delete data for each table
    for (const tableName of componentConfig.tables) {
      const preCount = await getTableCount(supabase, tableName, projectId, user.id, componentConfig.requiresOwner);
      preDeletionSummary[tableName] = { count: preCount };

      const result = await deleteTableData(supabase, tableName, projectId, user.id, componentConfig.requiresOwner);
      deletionResults[tableName] = result;
    }

    // Calculate totals
    const totalRecordsDeleted = Object.values(deletionResults)
      .reduce((sum, result) => sum + (result.deletedCount || 0), 0);
    
    const hasErrors = Object.values(deletionResults)
      .some(result => !result.success);


    res.json({
      success: !hasErrors,
      message: hasErrors 
        ? `Component data partially wiped with ${Object.values(deletionResults).filter(r => !r.success).length} errors`
        : `Component data wiped successfully. ${totalRecordsDeleted} records deleted.`,
      data: {
        component: componentName,
        totalRecordsDeleted,
        deletionResults,
        hasErrors
      }
    });
  } catch (error) {
    console.error('Wipe component data error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to wipe component data'
    });
  }
}

// Get list of available components for wiping
async function getWipeableComponents(req, res) {
  try {
    const { id: projectId } = req.params;
    const { user, supabase } = await verifyUser(req);

    // Check basic permission
    const hasViewPermission = await hasPermission(supabase, projectId, user.id, 'canViewContent');
    if (!hasViewPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view component data'
      });
    }

    const isOwner = await hasPermission(supabase, projectId, user.id, 'canDeleteProject');

    // Filter components based on permissions
    const availableComponents = Object.entries(COMPONENT_DATA_MAPPING)
      .filter(([, config]) => !config.requiresOwner || isOwner)
      .map(([componentName, config]) => ({
        name: componentName,
        description: config.description,
        requiresOwner: config.requiresOwner,
        canWipe: !config.requiresOwner || isOwner,
        tables: config.tables
      }));

    res.json({
      success: true,
      data: {
        components: availableComponents,
        userIsOwner: isOwner
      }
    });
  } catch (error) {
    console.error('Get wipeable components error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get wipeable components'
    });
  }
}

export {
  getComponentDataSummary,
  wipeComponentData,
  getWipeableComponents
};