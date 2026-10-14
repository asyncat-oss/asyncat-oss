// den/src/agent/learningSettings.js
// Settings → Privacy & safety → Learning from chats: whether Asyncat saves
// memories from chats on its own (on unless turned off), and whether it
// offers to save a skill after a chat where the agent worked through a task
// (off unless turned on). Kept in the app config as "on" or "off".
// Temporary chats learn nothing either way (see AgentRuntime).

import { getConfigValue, setConfigValue } from '../config/appConfig.js';

export const REMEMBER_CHATS_KEY = 'ASYNCAT_REMEMBER_CHATS';
export const SUGGEST_SKILLS_KEY = 'ASYNCAT_SUGGEST_SKILLS';

function readSwitch(key, fallback) {
  let value = process.env[key];
  if (value === undefined) value = getConfigValue(key);
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  return !/^(off|false|0|no)$/i.test(String(value).trim());
}

export function learningSettings() {
  return {
    rememberChats: readSwitch(REMEMBER_CHATS_KEY, true),
    suggestSkills: readSwitch(SUGGEST_SKILLS_KEY, false),
  };
}

/** Change either switch ({ rememberChats, suggestSkills }); others are ignored. */
export function setLearningSettings(changes = {}) {
  if (typeof changes.rememberChats === 'boolean') setConfigValue(REMEMBER_CHATS_KEY, changes.rememberChats ? 'on' : 'off');
  if (typeof changes.suggestSkills === 'boolean') setConfigValue(SUGGEST_SKILLS_KEY, changes.suggestSkills ? 'on' : 'off');
  return learningSettings();
}
