import type { Server } from 'socket.io';

// The socket.io server, set once at startup, so services can push live updates to people.
let io: Server | null = null;

export const setRealtime = (server: Server) => {
  io = server;
};

/** Every signed-in socket joins its person's room when it connects. */
export const userRoom = (userId: string) => `user:${userId}`;

/** Sends an event to every open tab and phone of this person (nothing happens if they aren't online). */
export const emitToUser = (userId: string, event: string, payload: unknown) => {
  io?.to(userRoom(userId)).emit(event, payload);
};
