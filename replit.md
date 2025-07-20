# Replit Configuration

## Overview

This is a full-stack real-time chat application built with React, Express, and WebSockets. The application features a unique "scrolling chat" interface where messages animate across the screen horizontally, creating a typewriter-like experience where users can see each other typing in real-time.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Build Tool**: Vite with custom configuration for development and production
- **Routing**: Wouter for client-side routing
- **State Management**: React hooks with TanStack Query for server state
- **Real-time Communication**: WebSocket client for live chat features

### Backend Architecture
- **Runtime**: Node.js with Express server
- **Language**: TypeScript with ES modules
- **Real-time**: WebSocket server for chat functionality
- **API**: RESTful endpoints for message history
- **Development**: Vite middleware integration for seamless dev experience

### Data Storage Solutions
- **Primary**: In-memory storage (MemStorage class) for development/demo
- **Database Ready**: Drizzle ORM configured for PostgreSQL with Neon database
- **Schema**: Defined in shared directory for type safety across frontend/backend
- **Migrations**: Drizzle Kit setup for database schema management

## Key Components

### Real-time Chat System
- **Message Flow**: Users type and see keystrokes in real-time
- **Animation**: Messages scroll horizontally across the screen
- **Rooms**: Support for multiple chat rooms via URL parameters
- **Typing Indicators**: Live keystroke broadcasting to other users
- **Auto-completion**: Messages auto-complete after 15 seconds of idle time
- **Spam Protection**: Rate limiting and paste detection to prevent abuse

### UI Components
- **Chat Viewport**: Main scrolling message area with horizontal animation
- **Message Bubbles**: Color-coded user messages with position tracking
- **Connection Status**: Real-time connection and user count display
- **Customization Bar**: User controls for name, colors, and message input

### WebSocket Integration
- **Connection Management**: Automatic reconnection with exponential backoff
- **Message Types**: Support for keystrokes, complete messages, join/leave events
- **Room Management**: Query parameter-based room switching
- **Error Handling**: Graceful degradation when WebSocket unavailable
- **Rate Limiting**: Server-side protection against spam (50 messages/minute max)
- **Content Validation**: Message length limits and timing controls

## Data Flow

### Message Lifecycle
1. User types in input field
2. Each keystroke sent via WebSocket to server
3. Server broadcasts to all users in same room
4. Recipients see live typing with message positioned on screen
5. On Enter, message marked complete and added to history
6. Messages animate across screen and eventually disappear

### State Management
- **Local State**: React useState for UI state and temporary data
- **Server State**: TanStack Query for API calls and caching
- **WebSocket State**: Custom hook managing connection and message handling
- **URL State**: Query parameters for room, theme, and customization

## External Dependencies

### Core Libraries
- **React Ecosystem**: React, ReactDOM, React Query for state management
- **UI Framework**: Radix UI primitives with shadcn/ui styling
- **Styling**: Tailwind CSS with custom configuration and design tokens
- **Real-time**: Native WebSocket API with custom connection management
- **Database**: Drizzle ORM with PostgreSQL dialect for Neon database

### Development Tools
- **Build**: Vite with React plugin and TypeScript support
- **Linting**: TypeScript compiler for type checking
- **Database**: Drizzle Kit for migrations and schema management
- **Replit Integration**: Runtime error overlay and cartographer plugins

## Deployment Strategy

### Production Build
- **Frontend**: Vite builds React app to dist/public directory
- **Backend**: esbuild bundles server code to dist/index.js
- **Static Assets**: Express serves built frontend from dist/public
- **Environment**: Production mode disables development middleware

### Development Environment
- **Vite Dev Server**: Integrated with Express for hot module replacement
- **TypeScript**: Compiled on-the-fly with tsx for server execution
- **WebSocket**: Separate path (/ws) to avoid conflicts with Vite HMR
- **Database**: Environment variable configuration for DATABASE_URL

### Database Setup
- **Schema**: Shared TypeScript definitions with Zod validation
- **Migrations**: Drizzle migrations stored in ./migrations directory
- **Connection**: Neon serverless PostgreSQL via DATABASE_URL
- **Fallback**: In-memory storage when database not configured

### Scalability Considerations
- **WebSocket**: Single server instance with in-memory client tracking
- **Storage**: Ready for database migration from in-memory to PostgreSQL
- **Real-time**: Room-based message broadcasting for performance
- **Cleanup**: Automatic old message deletion to manage memory usage