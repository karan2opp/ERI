import { io, Socket } from 'socket.io-client';
import { getAuthTokenValue } from '../services/api';

const URL = '/';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    // Re-evaluated on every (re)connect, so the server always sees a fresh Clerk token.
    // Signed-out visitors connect without one and can watch rooms but not broadcast.
    socket = io(URL, {
      auth: (cb) => {
        getAuthTokenValue().then(token => cb({ token })).catch(() => cb({ token: null }));
      },
    });
  }
  return socket;
};

/** Reconnect so the server re-reads our identity after signing in or out. */
export const reconnectSocket = () => {
  if (socket) {
    socket.disconnect().connect();
  }
};
