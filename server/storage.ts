import { messages, type Message, type InsertMessage } from "@shared/schema";

export interface IStorage {
  getRecentMessages(room: string, limit?: number): Promise<Message[]>;
  addMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, updates: Partial<Message>): Promise<Message | undefined>;
  deleteOldMessages(olderThanMinutes?: number): Promise<void>;
}

export class MemStorage implements IStorage {
  private messages: Map<number, Message>;
  private currentId: number;

  constructor() {
    this.messages = new Map();
    this.currentId = 1;
    
    // Clean up old messages every 5 minutes
    setInterval(() => {
      this.deleteOldMessages(30); // Remove messages older than 30 minutes
    }, 5 * 60 * 1000);
  }

  async getRecentMessages(room: string, limit: number = 50): Promise<Message[]> {
    const roomMessages = Array.from(this.messages.values())
      .filter(msg => msg.room === room)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    
    return roomMessages.reverse(); // Return in chronological order
  }

  async addMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentId++;
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<Message | undefined> {
    const message = this.messages.get(id);
    if (!message) return undefined;
    
    const updatedMessage = { ...message, ...updates };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
  }

  async deleteOldMessages(olderThanMinutes: number = 30): Promise<void> {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    
    for (const [id, message] of this.messages.entries()) {
      if (new Date(message.timestamp) < cutoffTime) {
        this.messages.delete(id);
      }
    }
  }
}

export const storage = new MemStorage();
