// den/src/agent/tools/installTools.js
// Installer and local-runtime readiness tools for Asyncat itself.

import {
  inspectSystemDependencies,
  recommendedInstallCommands,
} from '../../lib/systemDeps.js';
import { PermissionLevel } from './toolRegistry.js';

export const asyncatInstallReadinessTool = {
  name: 'asyncat_install_readiness',
  description: 'Check whether this machine has the core and optional system tools needed to install and run Asyncat local runtimes, including Node, npm, git, Python venv/pip, ffmpeg, llama-server, whisper-server, Piper, archive tools, and C++ build tools.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    try {
      return { success: true, ...inspectSystemDependencies() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export const asyncatInstallCommandsTool = {
  name: 'asyncat_install_commands',
  description: 'Return suggested package-manager commands for missing Asyncat installer/runtime dependencies. This only reports commands; it does not install packages.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      manager: {
        type: 'string',
        description: 'Optional package manager id, such as brew, apt, dnf, pacman, zypper, apk, winget, choco, or scoop.',
      },
    },
    required: [],
  },
  execute: async (args = {}) => {
    try {
      const report = inspectSystemDependencies();
      return {
        success: true,
        manager: args.manager || report.packageManagers.preferred?.id || null,
        commands: recommendedInstallCommands(report.checks, args.manager || report.packageManagers.preferred?.id || null),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export const installTools = [
  asyncatInstallReadinessTool,
  asyncatInstallCommandsTool,
];

export default installTools;

