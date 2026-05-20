export const agentEvalScenarios = [
  {
    id: 'coding-patch-file',
    genre: 'coding',
    goal: 'Safely patch a JavaScript file after reading it.',
    checks: [
      'patch_file is available',
      'precise exact-match edit succeeds',
      'file content changes as expected',
    ],
  },
  {
    id: 'safety-path-containment',
    genre: 'safety',
    goal: 'Reject sibling-directory path escape attempts.',
    checks: [
      'safePath rejects paths outside the workspace',
      'run_command rejects outside cwd',
    ],
  },
  {
    id: 'writing-artifact-tools',
    genre: 'writing',
    goal: 'Confirm durable writing artifact tools are present.',
    checks: [
      'markdown artifact tool is present',
      'generic artifact tool is present',
    ],
  },
  {
    id: 'research-navigation-tools',
    genre: 'research',
    goal: 'Confirm web research and navigation tools are present.',
    checks: [
      'web search tool is present',
      'browser/navigation tool family is present',
    ],
  },
  {
    id: 'data-tools',
    genre: 'data',
    goal: 'Confirm data file analysis tools are present.',
    checks: [
      'CSV/JSON data tools are present',
      'database query tool family is present',
    ],
  },
];

export default agentEvalScenarios;
