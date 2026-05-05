export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const getDueStatus = (dueDate) => {
  if (!dueDate) return "none";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  if (due <= nextWeek) return "thisWeek";
  return "later";
};

export const getDueDateStyle = (dueDate) => {
  const status = getDueStatus(dueDate);

  switch (status) {
    case "overdue":
      return "text-red-600 dark:text-red-400 midnight:text-red-400 font-semibold";
    case "today":
      return "text-amber-600 dark:text-amber-400 midnight:text-amber-400 font-semibold";
    case "thisWeek":
      return "text-blue-600 dark:text-blue-400 midnight:text-blue-400 font-medium";
    default:
      return "text-gray-600 dark:text-gray-400 midnight:text-gray-500";
  }
};
