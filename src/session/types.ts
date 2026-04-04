import type { CoreMessage } from 'ai';

export interface Session {
  id: string;
  title: string;
  messages: CoreMessage[];
  createdAt: string;
  updatedAt: string;
}
