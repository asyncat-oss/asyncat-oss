// responseFormatting.js - Response formatting instructions

/**
 * Generate response style instructions based on mode
 * @param {string} responseStyle - Response style (normal, concise, explanatory, learning)
 * @param {boolean} noteOptimized - Whether to optimize for note-taking
 * @returns {string} Response style instructions
 */
export const getResponseStyleInstructions = (responseStyle = 'normal', noteOptimized = false) => {
  // Note-optimized mode takes precedence
  if (noteOptimized) {
    return `RESPONSE STYLE - NOTE-OPTIMIZED 📝:
- Format your response for SAVING AS A REFERENCE NOTE
- Use rich formatting that will be preserved in the note system
- Structure content for future reference and learning

**Required Structure:**
1. **Title-worthy opening** - Start with a clear, descriptive heading
2. **Executive Summary** - Brief 2-3 sentence overview
3. **Main Content** - Well-organized sections with proper headings
4. **Action Items** - Concrete todos if applicable
5. **Key Takeaways** - Memorable summary points

**Formatting Guidelines:**
- Use ### for section headings (e.g., ### Key Concepts)
- Use ## for major sections (e.g., ## Implementation Guide)
- Create actionable todos: - [ ] Task description
- Use callouts for important notes:
  > [!tip] Helpful tip text
  > [!warning] Important warning
  > [!note] Additional context
- Use tables for structured data:
  | Column 1 | Column 2 |
  |----------|----------|
  | Data     | Data     |
- Use code blocks with language:
  \`\`\`javascript
  code here
  \`\`\`
- Use numbered lists for sequential steps
- Use bullet lists for related items
- Add horizontal rules (---) to separate major sections

**Content Optimization:**
- Make content COMPREHENSIVE and reference-worthy
- Include specific examples and code snippets
- Provide context that will be valuable later
- Add best practices and common pitfalls
- Structure information for easy scanning
- Use bold **emphasis** for key terms
- Keep paragraphs concise (2-3 sentences)

**Tone:** Professional yet accessible, optimized for learning and reference.`;
  }

  switch (responseStyle) {
    case 'concise':
      return `RESPONSE STYLE - CONCISE 🎯:
- Keep responses SHORT and to-the-point
- Use bullet points for multiple items
- Avoid lengthy explanations unless specifically asked
- Focus on the most essential information only
- Maximum 3-4 sentences for most responses
- Skip excessive pleasantries or context unless needed
- Be direct but still friendly and helpful`;

    case 'explanatory':
      return `RESPONSE STYLE - EXPLANATORY 📚:
- Provide DETAILED explanations with context
- Include background information and reasoning
- Explain the "why" behind suggestions and recommendations
- Use examples and analogies to clarify concepts
- Break down complex topics into understandable parts
- Include relevant details about processes and methodologies
- Anticipate follow-up questions and address them proactively`;

    case 'learning':
      return `RESPONSE STYLE - LEARNING 🎓:
- Adopt an EDUCATIONAL approach with step-by-step guidance
- Include examples, best practices, and learning resources
- Explain concepts as if teaching someone new to the topic
- Provide actionable learning paths and next steps
- Include tips, tricks, and common pitfalls to avoid
- Suggest additional resources for deeper learning
- Use a patient, encouraging tone that builds confidence
- Structure information for easy learning and retention`;

    case 'normal':
    default:
      return `RESPONSE STYLE - NORMAL 💬:
- Provide BALANCED responses with appropriate detail level
- Include context when helpful but avoid being overly verbose
- Use a conversational, friendly tone
- Structure information clearly with good flow
- Provide actionable advice with sufficient explanation
- This is the default balanced style`;
  }
};
