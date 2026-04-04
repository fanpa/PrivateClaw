import type { ModelMessage } from 'ai';

export interface Session {
  id: string;
  title: string;
  messages: ModelMessage[];
  createdAt: string;
  updatedAt: string;
}
