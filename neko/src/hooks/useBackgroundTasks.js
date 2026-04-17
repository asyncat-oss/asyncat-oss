import { useState, useEffect } from 'react';
import { bgTasks } from '../utils/backgroundTasks';

export function useBackgroundTasks() {
  const [tasks, setTasks] = useState(() => bgTasks.snapshot());
  useEffect(() => bgTasks.subscribe(setTasks), []);
  return tasks;
}
