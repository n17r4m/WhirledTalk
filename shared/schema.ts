import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  content: text("content").notNull(),
  room: text("room").notNull().default("global"),
  isTyping: boolean("is_typing").default(false),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  xPosition: integer("x_position").notNull(),
  yPosition: integer("y_position").notNull(),
  userColor: text("user_color"),
  fontSize: text("font_size"),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  username: true,
  content: true,
  room: true,
  isTyping: true,
  xPosition: true,
  yPosition: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// WebSocket message types
export const wsMessageSchema = z.object({
  type: z.enum(["keystroke", "newMessage", "join", "leave", "nameError"]),
  username: z.string(),
  content: z.string().optional(),
  room: z.string().default("global"),
  isTyping: z.boolean().optional(),
  yPosition: z.number().optional(),
  userColor: z.string().optional(),
  fontSize: z.string().optional(),
  sessionId: z.string().optional(),
  browserFingerprint: z.string().optional(),
  error: z.string().optional(),
});

export type WSMessage = z.infer<typeof wsMessageSchema>;

// Session management types
export interface UserSession {
  sessionId: string;
  username: string;
  room: string;
  browserFingerprint: string;
  lastSeen: number;
  connectionCount: number;
}
