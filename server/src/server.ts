import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { clerkMiddleware, clerkClient } from '@clerk/express';
import { verifyToken } from '@clerk/backend';
import { Server } from 'socket.io';
import { eq } from 'drizzle-orm';
import { env } from './common/config/env';
import { db } from './common/db';
import { drives, users } from './common/db/schema';
import { canSeeTeamDrives } from './common/auth/roles';
import { isUuid } from './common/utils/validation';

import userRoutes from './module/user/userRoutes';
import treeRoutes from './module/tree/treeRoutes';
import adminRoutes from './module/admin/adminRoutes';
import driveRoutes from './module/drive/driveRoutes';
import notificationRoutes from './module/notification/notificationRoutes';
import categoryRoutes from './module/category/categoryRoutes';
import { setRealtime, userRoom } from './common/realtime';
import statsRoutes from './module/stats/statsRoutes';
import siteRoutes from './module/site/siteRoutes';
import { ensureDefaultCategories } from './common/services/defaultCategories';
import { ensureBaselineNumbers } from './common/services/settingsService';
import mapsRoutes from './module/maps/mapsRoutes';
import tilesRoutes from './module/maps/tilesRoutes';
import placeRoutes from './module/place/placeRoutes';
import uploadRoutes from './module/upload/uploadRoutes';
import { startUploadSweeper } from './common/services/uploadSweeper';

const app = express();
const PORT = parseInt(env.PORT, 10) || 5000;

if (env.TRUST_PROXY) {
  app.set('trust proxy', parseInt(env.TRUST_PROXY, 10) || env.TRUST_PROXY);
}

const allowedOrigins = env.CLIENT_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Clerk is the only identity source. Without keys every protected route returns 401.
const clerkConfigured = Boolean(env.CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY);

if (clerkConfigured) {
  app.use(clerkMiddleware());
} else {
  console.error('⚠️ CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY are not set: sign-in is unavailable and all protected routes will return 401.');
}

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'PlanTree Node.js Express API 🌿',
    clerkConfigured,
    cloudinaryConfigured: Boolean(env.CLOUDINARY_CLOUD_NAME),
    timestamp: new Date().toISOString()
  });
});

// Mount Feature Modules
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/trees', treeRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/drives', driveRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/site', siteRoutes);
app.use('/api/v1/place-forms', placeRoutes);
app.use('/api/v1/uploads', uploadRoutes);
// Tiles first: they have their own (higher) rate limit
app.use('/api/v1/maps/tiles', tilesRoutes);
app.use('/api/v1/maps', mapsRoutes);

app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'PlanTree Platform API 🌿',
    version: '1.0.0',
    documentation: '/api/v1/health'
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    // Only 4xx errors (e.g. malformed JSON) carry messages meant for the client.
    error: status < 500 ? err.message : 'Internal Server Error'
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 PlanTree Express server running on port ${PORT} (0.0.0.0)`);
  console.log(`🌐 Allowed Client Origins: ${allowedOrigins.join(', ')}`);
  // The starting tree categories (once ever); a failure here only logs
  void ensureDefaultCategories();
  // The home page's starting numbers (once; admins change them in Settings)
  void ensureBaselineNumbers();
  // Photos uploaded but never used are removed once a day (see common/services/uploadSweeper.ts)
  startUploadSweeper();
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});
// Services push notifications to people through this
setRealtime(io);

// Live-location rooms look like plant_<id> or drive_<id>.
const ROOM_PATTERN = /^(plant|drive)_[A-Za-z0-9-]{1,64}$/;

// Anyone may connect and watch a room, but only sockets with a valid Clerk session token can broadcast.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (typeof token === 'string' && token && clerkConfigured) {
    try {
      const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
      socket.data.userId = payload.sub;

      try {
        const clerkUser = await clerkClient.users.getUser(payload.sub);
        socket.data.userName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || 'Volunteer';
      } catch {
        socket.data.userName = 'Volunteer';
      }
    } catch {
      return next(new Error('Invalid authentication token'));
    }
  }

  next();
});

/**
 * A drive room follows its drive: a drive for everyone has an open room (anyone may watch; sending
 * still needs a sign-in), a team-only drive's room is for team members and admins. Both the drive's
 * visibility and the person's role are read from the database, cached for 30 s per socket and room,
 * so a change takes effect within moments without reconnecting.
 */
const ROOM_CACHE_MS = 30_000;
async function mayUseRoom(socket: { data: Record<string, any> }, room: string): Promise<boolean> {
  if (!room.startsWith('drive_')) return true; // tree rooms are open
  const cache: Record<string, { at: number; ok: boolean }> = (socket.data.roomChecks ??= {});
  const hit = cache[room];
  if (hit && Date.now() - hit.at < ROOM_CACHE_MS) return hit.ok;

  const driveId = room.slice('drive_'.length);
  let ok = false;
  if (isUuid(driveId)) {
    const [drive] = await db.select({ visibility: drives.visibility }).from(drives).where(eq(drives.id, driveId)).limit(1);
    if (drive?.visibility === 'ALL') {
      ok = true;
    } else if (drive && socket.data.userId) {
      const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, socket.data.userId)).limit(1);
      ok = canSeeTeamDrives(row?.role);
    }
  }
  cache[room] = { at: Date.now(), ok };
  return ok;
}

io.on('connection', (socket) => {
  // Signed in: this socket gets your notifications live
  if (socket.data.userId) socket.join(userRoom(socket.data.userId));
  // The app asks whether this connection knows who it is (it reconnects with its sign-in if not)
  socket.on('inbox:hello', (ack) => {
    if (typeof ack === 'function') ack(Boolean(socket.data.userId));
  });

  socket.on('join_tracking', async (room) => {
    if (typeof room !== 'string' || !ROOM_PATTERN.test(room)) return;
    if (!(await mayUseRoom(socket, room))) return;
    socket.join(room);
  });

  socket.on('leave_tracking', (room) => {
    if (typeof room === 'string') {
      socket.leave(room);
    }
  });

  socket.on('send_location', async (data) => {
    const userId: string | undefined = socket.data.userId;
    if (!userId) return;

    const { room, latitude, longitude, timestamp } = data ?? {};
    if (
      typeof room !== 'string' || !ROOM_PATTERN.test(room) ||
      typeof latitude !== 'number' || !(Math.abs(latitude) <= 90) ||
      typeof longitude !== 'number' || !(Math.abs(longitude) <= 180)
    ) {
      return;
    }
    if (!(await mayUseRoom(socket, room))) return;

    // Identity is taken from the verified token, never from the client payload.
    socket.to(room).emit('receive_location', {
      room,
      userId,
      userName: socket.data.userName,
      latitude,
      longitude,
      timestamp: typeof timestamp === 'number' ? timestamp : Date.now()
    });
  });
});
