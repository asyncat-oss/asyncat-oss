// Utility functions for date and event formatting

// Calculate date range for different calendar views
export const getViewDateRange = (view, currentDate) => {
  let startDate, endDate;
  
  if (view === 'day') {
    // For day view, expand the range slightly to capture multi-day events
    startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 1); // Look back 1 day for multi-day events
    startDate.setHours(0, 0, 0, 0);
    
    endDate = new Date(currentDate);
    endDate.setDate(endDate.getDate() + 1); // Look ahead 1 day for multi-day events
    endDate.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
    startDate = new Date(currentDate);
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - mondayOffset);
    startDate.setHours(0, 0, 0, 0);
    
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
    endDate.setHours(23, 59, 59, 999);
  } else { // 'month'
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    
    startDate = new Date(firstDayOfMonth);
    const firstDayOfWeek = firstDayOfMonth.getDay();
    const mondayOffsetFirst = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    startDate.setDate(firstDayOfMonth.getDate() - mondayOffsetFirst);
    startDate.setHours(0, 0, 0, 0);
    
    endDate = new Date(lastDayOfMonth);
    const lastDayOfWeek = lastDayOfMonth.getDay();
    const sundayOffsetLast = lastDayOfWeek === 0 ? 0 : 7 - lastDayOfWeek;
    endDate.setDate(lastDayOfMonth.getDate() + sundayOffsetLast + 1);
    endDate.setHours(23, 59, 59, 999);
  }
  
  return { startDate, endDate };
};

// Optimized date range for adjacent periods (for prefetching)
export const getAdjacentDateRanges = (view, currentDate) => {
  const ranges = [];
  
  if (view === 'month') {
    // Previous month
    const prevMonth = new Date(currentDate);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    ranges.push({
      period: 'previous',
      ...getViewDateRange(view, prevMonth)
    });
    
    // Next month
    const nextMonth = new Date(currentDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    ranges.push({
      period: 'next',
      ...getViewDateRange(view, nextMonth)
    });
  } else if (view === 'week') {
    // Previous week
    const prevWeek = new Date(currentDate);
    prevWeek.setDate(prevWeek.getDate() - 7);
    ranges.push({
      period: 'previous',
      ...getViewDateRange(view, prevWeek)
    });
    
    // Next week
    const nextWeek = new Date(currentDate);
    nextWeek.setDate(nextWeek.getDate() + 7);
    ranges.push({
      period: 'next',
      ...getViewDateRange(view, nextWeek)
    });
  }
  
  return ranges;
};

// Format event for backend API
export const formatEventForBackend = (eventData) => {
  if (!eventData || !eventData.title) {
    throw new Error('Missing required event data');
  }
  
  let projectId = null;
  if (eventData.projectId) {
    if (typeof eventData.projectId === 'object' && eventData.projectId.id) {
      projectId = eventData.projectId.id;
    } else if (typeof eventData.projectId === 'string') {
      projectId = eventData.projectId;
    }
  }
  
  let startDate, endDate;
  
  if (eventData.startDate && eventData.endDate && 
      eventData.startTime && eventData.endTime) {
    if (!eventData.startTime.includes('T')) {
      startDate = new Date(`${eventData.startDate}T${eventData.startTime}`);
      endDate = new Date(`${eventData.endDate}T${eventData.endTime}`);
    } else {
      startDate = new Date(eventData.startTime);
      endDate = new Date(eventData.endTime);
    }
  } else if (eventData.date && 
            (eventData.startTime || eventData.start) && 
            (eventData.endTime || eventData.end)) {
    const timeStart = eventData.startTime || eventData.start;
    const timeEnd = eventData.endTime || eventData.end;
    
    startDate = new Date(`${eventData.date}T${timeStart}`);
    endDate = new Date(`${eventData.date}T${timeEnd}`);
  } else if (typeof eventData.startTime === 'string' && 
            typeof eventData.endTime === 'string' && 
            (eventData.startTime.includes('T') || eventData.startTime.includes('Z'))) {
    startDate = new Date(eventData.startTime);
    endDate = new Date(eventData.endTime);
  }
  
  if (!startDate || !endDate || 
      isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Could not create valid dates from the provided information');
  }
  
  if (endDate <= startDate) {
    throw new Error('End time must be after start time');
  }
  
  const formattedEvent = {
    title: eventData.title,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    color: eventData.color || 'purple',
    description: eventData.description || '',
    isAllDay: eventData.isAllDay || false,
    location: eventData.location || ''
  };

  if (projectId) {
    formattedEvent.projectId = projectId;
  }
  
  if (eventData.attendees && Array.isArray(eventData.attendees)) {
    formattedEvent.attendees = eventData.attendees;
  }

  if (eventData.isPersonalEvent !== undefined) {
    formattedEvent.isPersonalEvent = eventData.isPersonalEvent;
  }
  
  return formattedEvent;
};

// Format event for frontend display
export const formatEventForFrontend = (event) => {
  try {
    const startDateTime = new Date(event.startTime || event.date + 'T' + event.start);
    const endDateTime = new Date(event.endTime || event.date + 'T' + event.end);
    
    const isMultiDay = startDateTime.toDateString() !== endDateTime.toDateString();
    
    const formattedEvent = {
      id: event.id,
      title: event.title,
      date: startDateTime.toISOString().split('T')[0],
      start: startDateTime.toTimeString().slice(0, 5),
      end: endDateTime.toTimeString().slice(0, 5),
      color: event.color || 'purple',
      description: event.description,
      projectId: event.projectId,
      projectName: event.projectName,
      createdBy: event.createdBy,
      startTime: event.startTime,
      endTime: event.endTime,
      isMultiDay: isMultiDay,
      attendees: event.attendees || [],
      location: event.location || ''
    };
    
    if (isMultiDay) {
      formattedEvent.startDate = startDateTime.toISOString().split('T')[0];
      formattedEvent.endDate = endDateTime.toISOString().split('T')[0];
    }
    
    return formattedEvent;
  } catch (error) {
    console.error('Error formatting event for frontend:', error, event);
    return {
      id: event.id || 'error',
      title: event.title || 'Error: Invalid Event',
      date: new Date().toISOString().split('T')[0],
      start: '00:00',
      end: '00:01',
      color: 'red',
      description: `Error processing event: ${error.message}`,
      startTime: event.startTime,
      endTime: event.endTime,
      projectName: event.projectName,
      attendees: []
    };
  }
};

// Format Google Calendar event for frontend
// export const formatGoogleEventForFrontend = (googleEvent) => {
//   const isAllDay = !!googleEvent.isAllDay;
  
//   let startDate, endDate;
  
//   if (isAllDay) {
//     startDate = new Date(googleEvent.start.date || googleEvent.start);
//     endDate = new Date(googleEvent.end.date || googleEvent.end);
//   } else {
//     startDate = new Date(googleEvent.start.dateTime || googleEvent.start);
//     endDate = new Date(googleEvent.end.dateTime || googleEvent.end);
//   }
  
//   let color = googleEvent.colorId ? getColorFromId(googleEvent.colorId) : 'blue';
  
//   return {
//     id: `google-${googleEvent.id}`,
//     title: googleEvent.title,
//     description: googleEvent.description || '',
//     date: startDate.toISOString().split('T')[0],
//     start: startDate.toTimeString().slice(0, 5),
//     end: endDate.toTimeString().slice(0, 5),
//     startTime: startDate.toISOString(),
//     endTime: endDate.toISOString(),
//     color: color,
//     isMultiDay: startDate.toDateString() !== endDate.toDateString(),
//     isAllDay: isAllDay,
//     location: googleEvent.location || '',
//     sourceType: 'google',
//     htmlLink: googleEvent.htmlLink,
//     attendees: Array.isArray(googleEvent.attendees) ? googleEvent.attendees.map(a => ({
//       email: a.email,
//       name: a.displayName || a.email
//     })) : []
//   };
// };

// Map Google Calendar color IDs to our color scheme
export const getColorFromId = (colorId) => {
  const colorMap = {
    '1': 'blue',
    '2': 'blue',
    '3': 'purple',
    '4': 'red',
    '5': 'yellow',
    '6': 'yellow',
    '7': 'green',
    '8': 'green',
    '9': 'blue',
    '10': 'green',
    '11': 'red'
  };
  
  return colorMap[colorId] || 'blue';
};

// Create a utility object for backward compatibility and easier importing
export const calendarUtils = {
  getViewDateRange,
  getAdjacentDateRanges,
  formatEventForBackend,
  formatEventForFrontend,
  // formatGoogleEventForFrontend,
  getColorFromId
};
