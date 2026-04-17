// deltaSystem.js - Core delta tracking and operation system

// Browser-compatible hash function
function createSimpleHash(data) {
  let hash = 0;
  if (data.length === 0) return hash.toString(16);
  
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16);
}

// Operation types for delta tracking
export const OperationType = {
  INSERT_BLOCK: 'insert_block',
  DELETE_BLOCK: 'delete_block',
  UPDATE_BLOCK_CONTENT: 'update_block_content',
  UPDATE_BLOCK_TYPE: 'update_block_type',
  UPDATE_BLOCK_PROPERTIES: 'update_block_properties',
  MOVE_BLOCK: 'move_block',
  UPDATE_TITLE: 'update_title',
  UPDATE_METADATA: 'update_metadata',
  BATCH: 'batch'
};

// Block change types for granular tracking
export const ChangeType = {
  NONE: 'none',
  CONTENT: 'content',
  TYPE: 'type',
  PROPERTIES: 'properties',
  POSITION: 'position',
  DELETED: 'deleted',
  INSERTED: 'inserted'
};

// Block types for validation
export const BlockType = {
  TEXT: 'text',
  HEADING1: 'heading1',
  HEADING2: 'heading2',
  HEADING3: 'heading3',
  NUMBERED_LIST: 'numberedList',
  BULLET_LIST: 'bulletList',
  TODO: 'todo',
  QUOTE: 'quote',
  TABLE: 'table',
  CODE: 'code',
  DIVIDER: 'divider',
  IMAGE: 'image',
  FILE: 'file',
  CALLOUT: 'callout',
  TOGGLE: 'toggle',
  EMBED: 'embed',
  MATH: 'math',
  LINK_PREVIEW: 'linkPreview',
  // Chart blocks
  LINE_CHART: 'lineChart',
  BAR_CHART: 'barChart',
  PIE_CHART: 'pieChart',
  AREA_CHART: 'areaChart',
  SCATTER_CHART: 'scatterChart',
  DONUT_CHART: 'donutChart',
  // Advanced blocks
  PROGRESS_BAR: 'progressBar',
  BREADCRUMB: 'breadcrumb',
  BUTTON: 'button'
};

/**
 * Delta Operation class - represents a single change
 */
export class DeltaOperation {
  constructor(type, data, timestamp = Date.now()) {
    this.id = `op-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.data = data;
    this.timestamp = timestamp;
    this.applied = false;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      data: this.data,
      timestamp: this.timestamp
    };
  }
}

/**
 * Block state tracker - tracks individual block changes
 */
export class BlockState {
  constructor(block) {
    this.id = block.id;
    this.originalContent = block.content;
    this.originalType = block.type;
    this.originalProperties = { ...block.properties };
    this.originalPosition = null;
    this.currentContent = block.content;
    this.currentType = block.type;
    this.currentProperties = { ...block.properties };
    this.currentPosition = null;
    this.isDirty = false;
    this.changeType = ChangeType.NONE;
    this.lastModified = Date.now();
    this.version = this.calculateHash();
  }

  calculateHash() {
    const data = JSON.stringify({
      content: this.currentContent,
      type: this.currentType,
      properties: this.currentProperties
    });
    return createSimpleHash(data).substring(0, 8);
  }

  updateContent(content) {
    if (content !== this.currentContent) {
      this.currentContent = content;
      this.isDirty = true;
      this.changeType = ChangeType.CONTENT;
      this.lastModified = Date.now();
      this.version = this.calculateHash();
      return true;
    }
    return false;
  }

  updateType(type) {
    if (type !== this.currentType) {
      this.currentType = type;
      this.isDirty = true;
      this.changeType = ChangeType.TYPE;
      this.lastModified = Date.now();
      this.version = this.calculateHash();
      return true;
    }
    return false;
  }

  updateProperties(properties) {
    if (JSON.stringify(properties) !== JSON.stringify(this.currentProperties)) {
      this.currentProperties = { ...properties };
      this.isDirty = true;
      this.changeType = ChangeType.PROPERTIES;
      this.lastModified = Date.now();
      this.version = this.calculateHash();
      return true;
    }
    return false;
  }

  updatePosition(position) {
    if (position !== this.currentPosition) {
      this.currentPosition = position;
      this.isDirty = true;
      if (this.changeType === ChangeType.NONE) {
        this.changeType = ChangeType.POSITION;
      }
      this.lastModified = Date.now();
      return true;
    }
    return false;
  }

  reset() {
    this.originalContent = this.currentContent;
    this.originalType = this.currentType;
    this.originalProperties = { ...this.currentProperties };
    this.originalPosition = this.currentPosition;
    this.isDirty = false;
    this.changeType = ChangeType.NONE;
  }

  getChanges() {
    const changes = [];
    
    if (!this.isDirty) return changes;

    // Check for content changes
    if (this.currentContent !== this.originalContent) {
      changes.push({
        type: ChangeType.CONTENT,
        from: this.originalContent,
        to: this.currentContent
      });
    }

    // Check for type changes
    if (this.currentType !== this.originalType) {
      changes.push({
        type: ChangeType.TYPE,
        from: this.originalType,
        to: this.currentType
      });
    }

    // Check for property changes
    if (JSON.stringify(this.currentProperties) !== JSON.stringify(this.originalProperties)) {
      changes.push({
        type: ChangeType.PROPERTIES,
        from: this.originalProperties,
        to: this.currentProperties
      });
    }

    // Check for position changes
    if (this.currentPosition !== this.originalPosition && this.originalPosition !== null) {
      changes.push({
        type: ChangeType.POSITION,
        from: this.originalPosition,
        to: this.currentPosition
      });
    }

    return changes;
  }
}

/**
 * Delta Tracker - Main class for tracking document changes
 */
export class DeltaTracker {
  constructor(initialTitle = '', initialBlocks = []) {
    this.baselineTitle = initialTitle;
    this.currentTitle = initialTitle;
    this.baselineBlocks = this.cloneBlocks(initialBlocks);
    this.blockStates = new Map();
    this.operations = [];
    this.pendingOperations = [];
    this.appliedOperations = new Set();
    this.lastSyncTimestamp = Date.now();
    this.documentVersion = this.calculateDocumentVersion();
    
    // Initialize block states
    initialBlocks.forEach((block, index) => {
      const state = new BlockState(block);
      state.originalPosition = index;
      state.currentPosition = index;
      this.blockStates.set(block.id, state);
    });
  }

  cloneBlocks(blocks) {
    return blocks.map(block => ({
      ...block,
      properties: { ...block.properties }
    }));
  }

  calculateDocumentVersion() {
    const data = JSON.stringify({
      title: this.currentTitle,
      blocks: Array.from(this.blockStates.values()).map(state => ({
        id: state.id,
        version: state.version,
        position: state.currentPosition
      }))
    });
    return createSimpleHash(data).substring(0, 16);
  }

  // Track title changes
  updateTitle(newTitle) {
    if (newTitle !== this.currentTitle) {
      const operation = new DeltaOperation(
        OperationType.UPDATE_TITLE,
        { 
          from: this.currentTitle, 
          to: newTitle 
        }
      );
      
      this.currentTitle = newTitle;
      this.operations.push(operation);
      this.pendingOperations.push(operation);
      this.documentVersion = this.calculateDocumentVersion();
      
      return operation;
    }
    return null;
  }

  // Track metadata changes
  updateMetadata(newMetadata) {
    const operation = new DeltaOperation(
      OperationType.UPDATE_METADATA,
      { 
        metadata: newMetadata 
      }
    );
    
    this.operations.push(operation);
    this.pendingOperations.push(operation);
    this.documentVersion = this.calculateDocumentVersion();
    
    return operation;
  }

  // Track block insertion
  insertBlock(block, position) {
    const state = new BlockState(block);
    state.originalPosition = null; // New block has no original position
    state.currentPosition = position;
    state.changeType = ChangeType.INSERTED;
    state.isDirty = true;
    
    this.blockStates.set(block.id, state);
    
    // Update positions of subsequent blocks
    this.updateBlockPositions(position, 1);
    
    const operation = new DeltaOperation(
      OperationType.INSERT_BLOCK,
      { 
        block: {
          id: block.id,
          type: block.type,
          content: block.content,
          properties: block.properties
        },
        position 
      }
    );
    
    this.operations.push(operation);
    this.pendingOperations.push(operation);
    this.documentVersion = this.calculateDocumentVersion();
    
    return operation;
  }

  // Track block deletion
  deleteBlock(blockId) {
    const state = this.blockStates.get(blockId);
    if (!state) return null;
    
    const operation = new DeltaOperation(
      OperationType.DELETE_BLOCK,
      { 
        blockId,
        position: state.currentPosition,
        block: {
          type: state.currentType,
          content: state.currentContent,
          properties: state.currentProperties
        }
      }
    );
    
    // Update positions of subsequent blocks
    this.updateBlockPositions(state.currentPosition, -1);
    
    this.blockStates.delete(blockId);
    this.operations.push(operation);
    this.pendingOperations.push(operation);
    this.documentVersion = this.calculateDocumentVersion();
    
    return operation;
  }

  // Track block content update
  updateBlockContent(blockId, newContent) {
    const state = this.blockStates.get(blockId);
    if (!state) return null;
    
    if (state.updateContent(newContent)) {
      const operation = new DeltaOperation(
        OperationType.UPDATE_BLOCK_CONTENT,
        { 
          blockId,
          from: state.originalContent,
          to: newContent,
          version: state.version
        }
      );
      
      this.operations.push(operation);
      this.pendingOperations.push(operation);
      this.documentVersion = this.calculateDocumentVersion();
      
      return operation;
    }
    return null;
  }

  // Track block type change
  updateBlockType(blockId, newType) {
    const state = this.blockStates.get(blockId);
    if (!state) return null;
    
    if (state.updateType(newType)) {
      const operation = new DeltaOperation(
        OperationType.UPDATE_BLOCK_TYPE,
        { 
          blockId,
          from: state.originalType,
          to: newType,
          version: state.version
        }
      );
      
      this.operations.push(operation);
      this.pendingOperations.push(operation);
      this.documentVersion = this.calculateDocumentVersion();
      
      return operation;
    }
    return null;
  }

  // Track block properties update
  updateBlockProperties(blockId, newProperties) {
    const state = this.blockStates.get(blockId);
    if (!state) return null;
    
    if (state.updateProperties(newProperties)) {
      const operation = new DeltaOperation(
        OperationType.UPDATE_BLOCK_PROPERTIES,
        { 
          blockId,
          from: state.originalProperties,
          to: newProperties,
          version: state.version
        }
      );
      
      this.operations.push(operation);
      this.pendingOperations.push(operation);
      this.documentVersion = this.calculateDocumentVersion();
      
      return operation;
    }
    return null;
  }

  // Track block movement
  moveBlock(blockId, fromPosition, toPosition) {
    const state = this.blockStates.get(blockId);
    if (!state || fromPosition === toPosition) return null;
    
    state.updatePosition(toPosition);
    
    // Update positions of affected blocks
    if (fromPosition < toPosition) {
      // Moving down: shift blocks up
      for (const [id, blockState] of this.blockStates) {
        if (id !== blockId && 
            blockState.currentPosition > fromPosition && 
            blockState.currentPosition <= toPosition) {
          blockState.currentPosition--;
        }
      }
    } else {
      // Moving up: shift blocks down
      for (const [id, blockState] of this.blockStates) {
        if (id !== blockId && 
            blockState.currentPosition >= toPosition && 
            blockState.currentPosition < fromPosition) {
          blockState.currentPosition++;
        }
      }
    }
    
    const operation = new DeltaOperation(
      OperationType.MOVE_BLOCK,
      { 
        blockId,
        fromPosition,
        toPosition 
      }
    );
    
    this.operations.push(operation);
    this.pendingOperations.push(operation);
    this.documentVersion = this.calculateDocumentVersion();
    
    return operation;
  }

  // Update block positions after insertion/deletion
  updateBlockPositions(position, offset) {
    for (const state of this.blockStates.values()) {
      if (state.currentPosition >= position) {
        state.currentPosition += offset;
      }
    }
  }

  // Get all pending operations (not yet synced)
  getPendingOperations() {
    return [...this.pendingOperations];
  }

  // Get all dirty blocks
  getDirtyBlocks() {
    const dirtyBlocks = [];
    for (const [blockId, state] of this.blockStates) {
      if (state.isDirty) {
        dirtyBlocks.push({
          id: blockId,
          changes: state.getChanges(),
          version: state.version,
          lastModified: state.lastModified
        });
      }
    }
    return dirtyBlocks;
  }

  // Generate changeset for sync
  generateChangeset(sinceTimestamp = null) {
    const operations = sinceTimestamp 
      ? this.operations.filter(op => op.timestamp > sinceTimestamp)
      : this.pendingOperations;
    
    if (operations.length === 0) return null;
    
    return {
      id: `changeset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      operations: operations.map(op => op.toJSON()),
      baselineVersion: this.documentVersion,
      timestamp: Date.now(),
      stats: {
        totalOperations: operations.length,
        operationTypes: this.countOperationTypes(operations),
        affectedBlocks: this.getAffectedBlockIds(operations).length
      }
    };
  }

  // Mark operations as synced
  markOperationsSynced(operationIds) {
    operationIds.forEach(id => {
      this.appliedOperations.add(id);
    });
    
    // Remove synced operations from pending
    this.pendingOperations = this.pendingOperations.filter(
      op => !operationIds.includes(op.id)
    );
    
    // Reset dirty states for synced blocks
    for (const state of this.blockStates.values()) {
      if (state.isDirty && this.pendingOperations.length === 0) {
        state.reset();
      }
    }
    
    this.lastSyncTimestamp = Date.now();
  }

  // Merge remote changes (for collaborative editing)
  mergeRemoteOperations(remoteOperations) {
    const conflicts = [];
    const merged = [];
    
    for (const remoteOp of remoteOperations) {
      // Check for conflicts with local pending operations
      const hasConflict = this.pendingOperations.some(localOp => 
        this.operationsConflict(localOp, remoteOp)
      );
      
      if (hasConflict) {
        conflicts.push(remoteOp);
      } else {
        // Apply remote operation
        this.applyOperation(remoteOp);
        merged.push(remoteOp);
      }
    }
    
    return { merged, conflicts };
  }

  // Check if two operations conflict
  operationsConflict(op1, op2) {
    // Same block, overlapping time window
    if (op1.data.blockId && op2.data.blockId) {
      if (op1.data.blockId === op2.data.blockId) {
        const timeDiff = Math.abs(op1.timestamp - op2.timestamp);
        return timeDiff < 1000; // Conflicts if within 1 second
      }
    }
    
    // Both updating title
    if (op1.type === OperationType.UPDATE_TITLE && 
        op2.type === OperationType.UPDATE_TITLE) {
      return true;
    }
    
    // Position conflicts
    if ((op1.type === OperationType.MOVE_BLOCK || op1.type === OperationType.INSERT_BLOCK) &&
        (op2.type === OperationType.MOVE_BLOCK || op2.type === OperationType.INSERT_BLOCK)) {
      return op1.data.position === op2.data.position || 
             op1.data.toPosition === op2.data.toPosition;
    }
    
    return false;
  }

  // Apply an operation (for remote changes)
  applyOperation(operation) {
    switch (operation.type) {
      case OperationType.UPDATE_TITLE:
        this.currentTitle = operation.data.to;
        break;
        
      case OperationType.INSERT_BLOCK:
        // Add to block states
        const newState = new BlockState(operation.data.block);
        newState.currentPosition = operation.data.position;
        this.blockStates.set(operation.data.block.id, newState);
        this.updateBlockPositions(operation.data.position, 1);
        break;
        
      case OperationType.DELETE_BLOCK:
        this.blockStates.delete(operation.data.blockId);
        this.updateBlockPositions(operation.data.position, -1);
        break;
        
      case OperationType.UPDATE_BLOCK_CONTENT:
        const contentState = this.blockStates.get(operation.data.blockId);
        if (contentState) {
          contentState.currentContent = operation.data.to;
          contentState.version = operation.data.version;
        }
        break;
        
      case OperationType.UPDATE_BLOCK_TYPE:
        const typeState = this.blockStates.get(operation.data.blockId);
        if (typeState) {
          typeState.currentType = operation.data.to;
          typeState.version = operation.data.version;
        }
        break;
        
      case OperationType.UPDATE_BLOCK_PROPERTIES:
        const propState = this.blockStates.get(operation.data.blockId);
        if (propState) {
          propState.currentProperties = operation.data.to;
          propState.version = operation.data.version;
        }
        break;
        
      case OperationType.MOVE_BLOCK:
        const moveState = this.blockStates.get(operation.data.blockId);
        if (moveState) {
          this.moveBlock(
            operation.data.blockId,
            operation.data.fromPosition,
            operation.data.toPosition
          );
        }
        break;
        
      case OperationType.UPDATE_METADATA:
        // Metadata changes don't affect block states but are tracked for sync
        break;
    }
    
    this.documentVersion = this.calculateDocumentVersion();
  }

  // Get current document state
  getCurrentState() {
    const blocks = [];
    const sortedStates = Array.from(this.blockStates.values())
      .sort((a, b) => a.currentPosition - b.currentPosition);
    
    for (const state of sortedStates) {
      blocks.push({
        id: state.id,
        type: state.currentType,
        content: state.currentContent,
        properties: state.currentProperties
      });
    }
    
    return {
      title: this.currentTitle,
      blocks,
      version: this.documentVersion
    };
  }

  // Reset to baseline
  resetToBaseline() {
    this.currentTitle = this.baselineTitle;
    this.blockStates.clear();
    this.operations = [];
    this.pendingOperations = [];
    
    this.baselineBlocks.forEach((block, index) => {
      const state = new BlockState(block);
      state.originalPosition = index;
      state.currentPosition = index;
      this.blockStates.set(block.id, state);
    });
    
    this.documentVersion = this.calculateDocumentVersion();
  }

  // Update baseline after successful sync
  updateBaseline(title, blocks) {
    this.baselineTitle = title;
    this.baselineBlocks = this.cloneBlocks(blocks);
    
    // Reset all block states to clean
    for (const state of this.blockStates.values()) {
      state.reset();
    }
    
    this.lastSyncTimestamp = Date.now();
  }

  // Helper methods
  countOperationTypes(operations) {
    const counts = {};
    for (const op of operations) {
      counts[op.type] = (counts[op.type] || 0) + 1;
    }
    return counts;
  }

  getAffectedBlockIds(operations) {
    const blockIds = new Set();
    for (const op of operations) {
      if (op.data.blockId) {
        blockIds.add(op.data.blockId);
      }
    }
    return Array.from(blockIds);
  }

  // Get statistics
  getStatistics() {
    return {
      totalBlocks: this.blockStates.size,
      dirtyBlocks: this.getDirtyBlocks().length,
      pendingOperations: this.pendingOperations.length,
      totalOperations: this.operations.length,
      documentVersion: this.documentVersion,
      lastSync: this.lastSyncTimestamp
    };
  }
}

// Export singleton instance for easy use
export const deltaTracker = new DeltaTracker();

// Utility function to calculate diff between two blocks
export function calculateBlockDiff(oldBlock, newBlock) {
  const changes = [];
  
  if (oldBlock.content !== newBlock.content) {
    changes.push({
      type: ChangeType.CONTENT,
      from: oldBlock.content,
      to: newBlock.content
    });
  }
  
  if (oldBlock.type !== newBlock.type) {
    changes.push({
      type: ChangeType.TYPE,
      from: oldBlock.type,
      to: newBlock.type
    });
  }
  
  if (JSON.stringify(oldBlock.properties) !== JSON.stringify(newBlock.properties)) {
    changes.push({
      type: ChangeType.PROPERTIES,
      from: oldBlock.properties,
      to: newBlock.properties
    });
  }
  
  return changes;
}

// Utility function to apply changeset to blocks
export function applyChangeset(blocks, changeset) {
  let newBlocks = [...blocks];
  let newTitle = null;
  
  for (const operation of changeset.operations) {
    switch (operation.type) {
      case OperationType.UPDATE_TITLE:
        newTitle = operation.data.to;
        break;
        
      case OperationType.INSERT_BLOCK:
        newBlocks.splice(operation.data.position, 0, operation.data.block);
        break;
        
      case OperationType.DELETE_BLOCK:
        newBlocks = newBlocks.filter(b => b.id !== operation.data.blockId);
        break;
        
      case OperationType.UPDATE_BLOCK_CONTENT:
        newBlocks = newBlocks.map(b => 
          b.id === operation.data.blockId 
            ? { ...b, content: operation.data.to }
            : b
        );
        break;
        
      case OperationType.UPDATE_BLOCK_TYPE:
        newBlocks = newBlocks.map(b => 
          b.id === operation.data.blockId 
            ? { ...b, type: operation.data.to }
            : b
        );
        break;
        
      case OperationType.UPDATE_BLOCK_PROPERTIES:
        newBlocks = newBlocks.map(b => 
          b.id === operation.data.blockId 
            ? { ...b, properties: operation.data.to }
            : b
        );
        break;
        
      case OperationType.MOVE_BLOCK:
        const block = newBlocks.find(b => b.id === operation.data.blockId);
        if (block) {
          newBlocks = newBlocks.filter(b => b.id !== operation.data.blockId);
          newBlocks.splice(operation.data.toPosition, 0, block);
        }
        break;
        
      case OperationType.UPDATE_METADATA:
        // Metadata updates are handled at a higher level
        break;
    }
  }
  
  return { blocks: newBlocks, title: newTitle };
}

export default DeltaTracker;