// followUpSuggestions.js - AI-powered follow-up suggestion generation
// Generates contextual suggestions for the next user interaction

/**
 * Generate AI-powered follow-up suggestions based on conversation
 * @param {string} userMessage - User's message
 * @param {string} aiResponse - AI's response
 * @param {Object} contextData - Context data about user's workspace
 * @param {boolean} hasSelectedProjects - Whether user has projects selected
 * @param {string} mode - Chat mode (chat, build, etc.)
 * @param {Object} aiClient - AI client instance
 * @param {string} aiModel - AI model to use
 * @returns {Promise<Array>} Array of suggestion objects
 */
export async function generateFollowUpSuggestions(
  userMessage,
  aiResponse,
  contextData,
  hasSelectedProjects,
  mode = 'chat',
  aiClient,
  aiModel
) {
  try {
    // Handle null/undefined contextData safely
    const safeContextData = contextData || {};
    const workspaceName = safeContextData.workspaceName || 'Current Workspace';
    const hasTasks = safeContextData.tasks?.length > 0;
    const hasHabits = safeContextData.habits?.length > 0;
    const hasEvents = safeContextData.events?.length > 0;
    const hasProjects = safeContextData.projects?.length > 0;

    const suggestionPrompt = `Based on this conversation exchange, generate 3-4 intelligent follow-up suggestions that would be genuinely helpful to the user.

USER MESSAGE: "${userMessage}"
AI RESPONSE: "${aiResponse}"

CONTEXT:
- Mode: ${mode}
- Has projects selected: ${hasSelectedProjects}
- Workspace: ${workspaceName}
- Available data: ${hasTasks ? 'Tasks/Kanban' : ''} ${hasProjects ? 'Projects' : ''} ${hasHabits ? 'Habits' : ''} ${hasEvents ? 'Calendar' : ''}

Generate follow-up suggestions that are:
1. Contextually relevant to what was just discussed
2. Actionable and specific to their workspace/projects
3. Helpful for productivity and project management
4. Natural conversation continuations (NOT questions)
5. Written as direct commands or statements, as if the user is continuing the conversation

IMPORTANT: Write suggestions as STATEMENTS or COMMANDS, NOT as questions.
✅ GOOD: "Show me overdue tasks"
✅ GOOD: "Change the category to urgent"
✅ GOOD: "Create a reminder for tomorrow"
❌ BAD: "Do you want to see overdue tasks?"
❌ BAD: "Should I change the category?"

Format as a JSON array of objects with this structure:
[
  {
    "text": "Suggestion text (direct statement/command, not a question)",
    "category": "planning|analytics|automation|team|productivity|insights|create",
    "priority": 1-5 (5 being most relevant)
  }
]

Examples of good suggestions:
- "Show me my team's task completion rates this week"
- "Create a project timeline for this"
- "Analyze the biggest bottlenecks in my current projects"
- "Set up automated reminders for these tasks"
- "Change the priority to high"
- "Export this as a report"

Return ONLY the JSON array, no other text.`;

    const suggestionResponse = await aiClient.messages.create({
      model: aiModel,
      max_completion_tokens: 300,
      system: "You are a helpful AI that generates contextual follow-up suggestions. Respond only with valid JSON.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: suggestionPrompt }]
        }
      ]
    });

    const suggestionText = suggestionResponse.content[0]?.text || '[]';

    try {
      const cleanedText = suggestionText
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '')
        .trim();

      const suggestions = JSON.parse(cleanedText);

      if (Array.isArray(suggestions)) {
        return suggestions
          .filter(s => s.text && s.category && s.priority)
          .sort((a, b) => b.priority - a.priority)
          .slice(0, 4)
          .map(s => ({
            text: s.text,
            category: s.category,
            priority: s.priority
          }));
      }
    } catch (parseError) {
      console.warn('Failed to parse AI suggestions:', parseError);
    }

    return [];

  } catch (error) {
    console.error('Error generating follow-up suggestions:', error);
    return [];
  }
}
