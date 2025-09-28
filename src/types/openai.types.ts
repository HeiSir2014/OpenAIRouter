/**
 * OpenAI API compatible type definitions
 * Following OpenAI's official API schema
 */

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface Tool {
  type: 'function';
  function: FunctionDescription;
}

export interface FunctionDescription {
  name: string;
  description?: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export type ToolChoice =
  | 'none'
  | 'auto'
  | {
      type: 'function';
      function: {
        name: string;
      };
    };

export interface OpenAIRequest {
  // Core parameters
  messages?: OpenAIMessage[];
  prompt?: string;
  model?: string;

  // Response format
  response_format?: {
    type: 'json_object' | 'text';
  };

  // Control parameters
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];

  // Advanced parameters
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<number, number>;
  user?: string;
  seed?: number;

  // Tool calling
  tools?: Tool[];
  tool_choice?: ToolChoice;

  // Provider-specific (non-OpenAI)
  top_k?: number;
  repetition_penalty?: number;
  min_p?: number;
  top_a?: number;
}

export interface OpenAIResponse {
  id: string;
  object: 'chat.completion' | 'chat.completion.chunk' | 'text_completion';
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Choice[];
  usage?: Usage;
}

export interface Choice {
  index: number;
  message?: OpenAIMessage;
  delta?: OpenAIMessage;
  text?: string;
  finish_reason: string | null;
  logprobs?: LogProbs | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LogProbs {
  tokens: string[];
  token_logprobs: (number | null)[];
  top_logprobs: Record<string, number>[] | null;
  text_offset: number[];
}

export interface OpenAIError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  permission?: ModelPermission[];
  root?: string;
  parent?: string;
}

export interface ModelPermission {
  id: string;
  object: 'model_permission';
  created: number;
  allow_create_engine: boolean;
  allow_sampling: boolean;
  allow_logprobs: boolean;
  allow_search_indices: boolean;
  allow_view: boolean;
  allow_fine_tuning: boolean;
  organization: string;
  group?: string;
  is_blocking: boolean;
}

export interface ModelsResponse {
  object: 'list';
  data: ModelInfo[];
}
