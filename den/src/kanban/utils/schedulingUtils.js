import { Op } from "sequelize";
import { Event } from "../models/index.js";

/**
 * Fetch user's calendar events between start and end dates
 */
const getUserEvents = async (userId, startDate, endDate) => {
  try {
    const events = await Event.findAll({
      where: {
        createdBy: userId,
        [Op.and]: [
          {
            startTime: {
              [Op.lte]: endDate,
            },
          },
          {
            endTime: {
              [Op.gte]: startDate,
            },
          },
        ],
      },
      order: [["startTime", "ASC"]],
    });

    return events;
  } catch (error) {
    console.error("Error fetching user events:", error);
    return [];
  }
};

/**
 * Find free time slots in a day for a single user
 */
const findFreeTimeSlots = (
  date,
  events,
  workStartHour = 9,
  workEndHour = 18
) => {
  const dayStart = new Date(date);
  dayStart.setHours(workStartHour, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(workEndHour, 0, 0, 0);

  // Filter events for this specific day
  const dayEvents = events.filter((event) => {
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);

    return (
      (eventStart >= dayStart && eventStart < dayEnd) ||
      (eventEnd > dayStart && eventEnd <= dayEnd) ||
      (eventStart < dayStart && eventEnd > dayEnd)
    );
  });

  // Sort events by start time
  dayEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const freeSlots = [];
  let currentTime = dayStart;

  // Check for free time before first event
  if (dayEvents.length === 0) {
    freeSlots.push({
      start: new Date(dayStart),
      end: new Date(dayEnd),
      duration: dayEnd - dayStart,
    });
    return freeSlots;
  }

  // Check free time between events
  for (let i = 0; i < dayEvents.length; i++) {
    const event = dayEvents[i];
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);

    // Adjust event times to work hours
    const adjustedEventStart = eventStart < dayStart ? dayStart : eventStart;
    const adjustedEventEnd = eventEnd > dayEnd ? dayEnd : eventEnd;

    // Free time before this event
    if (currentTime < adjustedEventStart) {
      freeSlots.push({
        start: new Date(currentTime),
        end: new Date(adjustedEventStart),
        duration: adjustedEventStart - currentTime,
      });
    }

    currentTime = new Date(Math.max(currentTime, adjustedEventEnd));
  }

  // Check for free time after last event
  if (currentTime < dayEnd) {
    freeSlots.push({
      start: new Date(currentTime),
      end: new Date(dayEnd),
      duration: dayEnd - currentTime,
    });
  }

  return freeSlots;
};

/**
 * Single user scheduling algorithm (original logic)
 */
const allocateSingleUserSubtaskTimeSlots = async (
  userId,
  startDate,
  dueDate,
  estimatedDurationMinutes,
  subtaskId,
  subtaskTitle
) => {
  try {
    // Fetch user's events for the date range
    const events = await getUserEvents(userId, startDate, dueDate);

    // Fetch existing scheduled subtasks to avoid conflicts
    const { Card } = await import("../models/index.js");
    const existingCards = await Card.findAll({
      where: {
        createdBy: userId,
      },
    });

    // Extract existing scheduled subtask slots for this user
    const existingSubtaskSlots = [];
    existingCards.forEach((card) => {
      if (card.checklist && Array.isArray(card.checklist)) {
        card.checklist.forEach((subtask) => {
          if (subtask.allocatedSlots && Array.isArray(subtask.allocatedSlots)) {
            subtask.allocatedSlots.forEach((slot) => {
              // Only consider slots assigned to this specific user
              if (slot.assigneeId === userId && subtask.id !== subtaskId) {
                existingSubtaskSlots.push({
                  startTime: new Date(slot.startTime),
                  endTime: new Date(slot.endTime),
                  title: `Scheduled: ${subtask.text}`,
                });
              }
            });
          }
        });
      }
    });

    // Combine calendar events and existing scheduled subtasks as "busy times"
    const allBusyTimes = [
      ...events.map((event) => ({
        startTime: new Date(event.startTime),
        endTime: new Date(event.endTime),
        title: event.title,
      })),
      ...existingSubtaskSlots,
    ];

    const requiredDurationMs = estimatedDurationMinutes * 60 * 1000;
    let remainingDurationMs = requiredDurationMs;
    const allocatedSlots = [];

    // Iterate through each day from start date to due date
    const currentDate = new Date(startDate);
    const endDate = new Date(dueDate);

    while (currentDate <= endDate && remainingDurationMs > 0) {
      // Use the combined busy times (events + existing subtasks)
      const freeSlots = findFreeTimeSlots(currentDate, allBusyTimes);

      // Try to allocate time in this day's free slots
      for (const slot of freeSlots) {
        if (remainingDurationMs <= 0) break;

        const availableDuration = slot.duration;
        const allocationDuration = Math.min(
          availableDuration,
          remainingDurationMs
        );

        if (allocationDuration >= 15 * 60 * 1000) {
          // Minimum 15-minute slots
          const slotEnd = new Date(slot.start.getTime() + allocationDuration);

          allocatedSlots.push({
            subtaskId,
            title: subtaskTitle,
            startTime: new Date(slot.start),
            endTime: slotEnd,
            duration: Math.round(allocationDuration / (60 * 1000)),
            date: new Date(currentDate).toISOString().split("T")[0],
            assigneeId: userId, // Track which specific user this slot is for
          });

          remainingDurationMs -= allocationDuration;
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Check if full allocation was possible
    const fullyAllocated = remainingDurationMs <= 0;
    const allocatedDurationMinutes = Math.round(
      (requiredDurationMs - remainingDurationMs) / (60 * 1000)
    );

    return {
      success: fullyAllocated,
      fullyAllocated,
      allocatedSlots,
      totalRequiredDuration: estimatedDurationMinutes,
      allocatedDuration: allocatedDurationMinutes,
      remainingDuration: Math.round(remainingDurationMs / (60 * 1000)),
      warning: fullyAllocated
        ? null
        : `Could not allocate full duration for user ${userId}. ${Math.round(remainingDurationMs / (60 * 1000))} minutes remaining.`,
      userId,
    };
  } catch (error) {
    console.error("Error allocating single user subtask time slots:", error);
    return {
      success: false,
      error: error.message,
      allocatedSlots: [],
      userId,
    };
  }
};

/**
 * Multi-assignee scheduling - runs individual scheduling for each assignee
 * Each assignee gets their own time slots based on their individual availability
 */
const allocateMultiAssigneeSubtaskTimeSlots = async (
  assigneeIds,
  startDate,
  dueDate,
  estimatedDurationMinutes,
  subtaskId,
  subtaskTitle
) => {
  try {
    if (!assigneeIds || assigneeIds.length === 0) {
      throw new Error("At least one assignee is required");
    }

    // Remove duplicates and filter out null/undefined
    const uniqueAssigneeIds = [...new Set(assigneeIds.filter((id) => id))];

    console.log(
      `🎯 Scheduling "${subtaskTitle}" INDIVIDUALLY for ${uniqueAssigneeIds.length} assignees: ${uniqueAssigneeIds.join(", ")}`
    );

    const allResults = [];
    const allAllocatedSlots = [];
    let overallSuccess = true;
    let totalWarnings = [];

    // Schedule individually for each assignee
    for (const assigneeId of uniqueAssigneeIds) {
      console.log(
        `👤 Processing individual schedule for assignee: ${assigneeId}`
      );

      const individualResult = await allocateSingleUserSubtaskTimeSlots(
        assigneeId,
        startDate,
        dueDate,
        estimatedDurationMinutes,
        subtaskId,
        subtaskTitle
      );

      allResults.push({
        assigneeId,
        ...individualResult,
      });

      // Add assignee info to each allocated slot
      const assigneeSlots = individualResult.allocatedSlots.map((slot) => ({
        ...slot,
        assigneeId,
      }));

      allAllocatedSlots.push(...assigneeSlots);

      if (!individualResult.success) {
        overallSuccess = false;
      }

      if (individualResult.warning) {
        totalWarnings.push(`${assigneeId}: ${individualResult.warning}`);
      }

      console.log(
        `  ✅ ${assigneeId}: ${individualResult.allocatedDuration}/${estimatedDurationMinutes} minutes allocated`
      );
    }

    // Calculate overall stats
    const totalAllocatedMinutes = allResults.reduce(
      (sum, result) => sum + result.allocatedDuration,
      0
    );
    const expectedTotalMinutes =
      estimatedDurationMinutes * uniqueAssigneeIds.length;
    const fullyAllocated =
      overallSuccess && totalAllocatedMinutes === expectedTotalMinutes;

    console.log(
      `🎉 Multi-assignee scheduling complete: ${totalAllocatedMinutes}/${expectedTotalMinutes} total minutes allocated`
    );

    return {
      success: fullyAllocated,
      fullyAllocated,
      allocatedSlots: allAllocatedSlots,
      totalRequiredDuration: estimatedDurationMinutes,
      allocatedDuration: Math.round(
        totalAllocatedMinutes / uniqueAssigneeIds.length
      ), // Average per person
      remainingDuration: Math.round(
        (expectedTotalMinutes - totalAllocatedMinutes) /
          uniqueAssigneeIds.length
      ),
      warning: totalWarnings.length > 0 ? totalWarnings.join("; ") : null,
      assigneesCount: uniqueAssigneeIds.length,
      assigneeIds: uniqueAssigneeIds,
      individualResults: allResults, // Detailed results per assignee
      totalAllocatedMinutes,
      expectedTotalMinutes,
    };
  } catch (error) {
    console.error(
      "❌ Error allocating multi-assignee subtask time slots:",
      error
    );
    return {
      success: false,
      error: error.message,
      allocatedSlots: [],
      assigneeIds: assigneeIds || [],
    };
  }
};

/**
 * Main scheduling function - automatically detects single vs multi-assignee
 */
const allocateSubtaskTimeSlots = async (
  userIdOrAssigneeIds,
  startDate,
  dueDate,
  estimatedDurationMinutes,
  subtaskId,
  subtaskTitle
) => {
  // Handle both single user ID and array of assignee IDs
  let assigneeIds;

  if (Array.isArray(userIdOrAssigneeIds)) {
    assigneeIds = userIdOrAssigneeIds;
  } else {
    assigneeIds = [userIdOrAssigneeIds];
  }

  // Remove duplicates and filter out null/undefined
  const uniqueAssigneeIds = [...new Set(assigneeIds.filter((id) => id))];

  if (uniqueAssigneeIds.length === 1) {
    // Single assignee - use original algorithm
    console.log(`📋 Single assignee scheduling for: ${uniqueAssigneeIds[0]}`);
    return await allocateSingleUserSubtaskTimeSlots(
      uniqueAssigneeIds[0],
      startDate,
      dueDate,
      estimatedDurationMinutes,
      subtaskId,
      subtaskTitle
    );
  } else {
    // Multiple assignees - schedule individually for each
    console.log(
      `📋 Multi-assignee scheduling for ${uniqueAssigneeIds.length} people`
    );
    return await allocateMultiAssigneeSubtaskTimeSlots(
      uniqueAssigneeIds,
      startDate,
      dueDate,
      estimatedDurationMinutes,
      subtaskId,
      subtaskTitle
    );
  }
};

/**
 * Process checklist items and add scheduling data
 */
const processChecklistWithScheduling = async (checklist, userId) => {
  if (!checklist || !Array.isArray(checklist)) {
    return { processedChecklist: [], schedulingResults: [] };
  }

  const processedChecklist = [];
  const schedulingResults = [];

  for (const item of checklist) {
    const processedItem = { ...item };

    // Check if item has scheduling requirements
    const hasSchedulingData =
      item.startDate &&
      item.dueDate &&
      item.duration &&
      parseInt(item.duration) > 0;

    if (hasSchedulingData) {
      try {
        const startDate = new Date(item.startDate);
        const dueDate = new Date(item.dueDate);
        const duration = parseInt(item.duration);

        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(dueDate.getTime())) {
          throw new Error(`Invalid date format for subtask: ${item.text}`);
        }

        if (startDate > dueDate) {
          throw new Error(
            `Start date cannot be after due date for subtask: ${item.text}`
          );
        }

        // Determine assignees for scheduling
        let assigneesForScheduling = [];
        if (
          item.assignees &&
          Array.isArray(item.assignees) &&
          item.assignees.length > 0
        ) {
          assigneesForScheduling = item.assignees;
        } else {
          // Fallback to card creator if no assignees specified
          assigneesForScheduling = [userId];
        }

        console.log(
          `🎯 Processing subtask "${item.text}" with ${assigneesForScheduling.length} assignees (individual scheduling)`
        );

        // Perform automatic scheduling with individual assignee support
        const allocationResult = await allocateSubtaskTimeSlots(
          assigneesForScheduling,
          startDate,
          dueDate,
          duration,
          item.id || `temp-${Date.now()}`,
          item.text
        );

        // Add scheduling data to item
        processedItem.schedulingResult = allocationResult;
        processedItem.isScheduled = allocationResult.fullyAllocated;
        processedItem.allocatedSlots = allocationResult.allocatedSlots;

        schedulingResults.push({
          subtaskId: item.id,
          subtaskText: item.text,
          assigneesCount: assigneesForScheduling.length,
          assignees: assigneesForScheduling,
          schedulingType:
            assigneesForScheduling.length === 1 ? "single" : "individual-multi",
          ...allocationResult,
        });
      } catch (error) {
        console.error(`❌ Error scheduling subtask ${item.text}:`, error);
        processedItem.schedulingError = error.message;

        schedulingResults.push({
          subtaskId: item.id,
          subtaskText: item.text,
          success: false,
          error: error.message,
        });
      }
    }

    processedChecklist.push(processedItem);
  }

  return {
    processedChecklist,
    schedulingResults,
    hasSchedulingWarnings: schedulingResults.some(
      (r) => !r.success || !r.fullyAllocated
    ),
  };
};

export default {
  getUserEvents,
  allocateSubtaskTimeSlots,
  processChecklistWithScheduling,
  allocateMultiAssigneeSubtaskTimeSlots,
  allocateSingleUserSubtaskTimeSlots,
};
