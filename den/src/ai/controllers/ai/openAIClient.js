// openAIClient.js - OpenAI-compatible client
// Works with any OpenAI-compatible endpoint: OpenAI, Azure OpenAI, Ollama, llama.cpp, etc.
// Configure via env: AI_BASE_URL, AI_API_KEY, AI_MODEL
import OpenAI from "openai";

export class OpenAIClient {
  constructor(config) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel || 'gpt-4o';

    this.client = new OpenAI({
      apiKey: this.apiKey || 'not-configured',
      baseURL: this.endpoint
    });
    
    // Maintain compatibility with existing code structure
    this.messages = {
      create: async (options) => {
        return await this.createMessage(options);
      }
    };
  }

  /**
   * Create a chat completion with the Azure OpenAI API
   * Maintains compatibility with existing Anthropic-style interface
   */
  async createMessage(options) {
    const { 
      model, 
      max_tokens, 
      max_completion_tokens, 
      system, 
      messages,
      temperature,
      stream = false 
    } = options;
    
    try {
      const currentModel = model || this.defaultModel;
      
      // Convert to OpenAI format
      const openAIMessages = this.convertToOpenAIFormat(messages, system);
      
      // Prepare request options
      const requestOptions = {
        model: currentModel,
        messages: openAIMessages
      };
      
      // Only add temperature if explicitly provided (GPT-5.2 doesn't support custom values)
      if (temperature !== undefined) {
        requestOptions.temperature = temperature;
      }
      
      // Handle token limits - use max_completion_tokens if provided, otherwise max_tokens
      if (max_completion_tokens) {
        requestOptions.max_completion_tokens = max_completion_tokens;
      } else if (max_tokens) {
        requestOptions.max_tokens = max_tokens;
      }
      
      // Handle streaming if requested
      if (stream) {
        return this.client.chat.completions.create({
          ...requestOptions,
          stream: true
        });
      }
      
      // Regular completion
      const response = await this.client.chat.completions.create(requestOptions);
      
      // Convert to Anthropic-compatible format for backward compatibility
      return this.convertToAnthropicFormat(response);
      
    } catch (error) {
      console.error('Error calling Azure OpenAI:', error);
      throw error;
    }
  }

  /**
   * Convert messages to OpenAI format
   * Handles both Anthropic-style content arrays and plain strings
   */
  convertToOpenAIFormat(messages, systemMessage = null) {
    const openAIMessages = [];
    
    // Add system message if provided
    if (systemMessage) {
      openAIMessages.push({
        role: 'system',
        content: systemMessage
      });
    }
    
    // Convert messages
    messages.forEach(message => {
      let content = '';
      
      if (Array.isArray(message.content)) {
        // Anthropic-style content array
        content = message.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n');
      } else if (typeof message.content === 'string') {
        // Plain string content
        content = message.content;
      } else {
        console.warn('Unexpected message content format:', message.content);
        content = String(message.content);
      }
      
      openAIMessages.push({
        role: message.role,
        content: content
      });
    });
    
    return openAIMessages;
  }

  /**
   * Convert OpenAI response to Anthropic-compatible format
   * Maintains backward compatibility with existing code
   */
  convertToAnthropicFormat(openAIResponse) {
    const choice = openAIResponse.choices?.[0];
    
    if (!choice) {
      throw new Error('No choices in OpenAI response');
    }
    
    return {
      id: openAIResponse.id || `openai-${Date.now()}`,
      content: [
        {
          type: "text",
          text: choice.message?.content || ''
        }
      ],
      model: openAIResponse.model || this.defaultModel,
      role: "assistant",
      type: "message",
      usage: {
        input_tokens: openAIResponse.usage?.prompt_tokens || 0,
        output_tokens: openAIResponse.usage?.completion_tokens || 0,
        total_tokens: openAIResponse.usage?.total_tokens || 0
      }
    };
  }

  /**
   * Stream a chat completion (returns async generator)
   * For future streaming support
   */
  async *streamMessage(options) {
    const streamResponse = await this.createMessage({ ...options, stream: true });
    
    for await (const chunk of streamResponse) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text', text: delta }
        };
      }
    }
  }
}

export default OpenAIClient;
