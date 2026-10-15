import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { clerkMiddleware, clerkClient } from '@clerk/express';
import { verifyToken } from '@clerk/backend';
import { Server } from 'socket.io';
import { eq } from 'drizzle-orm';
import { env } from './common/config/env';
import { db } from './common/db';
import { users } from './common/db/schema';
import { canSeeDrives } from './common/auth/roles';

import userRoutes from './module/user/userRoutes';
import treeRoutes from './module/tree/treeRoutes';
import adminRoutes from './module/admin/adminRoutes';
import driveRoutes from './module/drive/driveRoutes';
import mapsRoutes from './module/maps/mapsRoutes';
import tilesRoutes from './module/maps/tilesRoutes';

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
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

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
 * Drive rooms are part of the planting drive schedule, so only team members and admins may watch or
 * broadcast in them. The role is read from the database (cached for 30 s per socket), so a promotion
 * or demotion takes effect within moments without reconnecting.
 */
const ROLE_CACHE_MS = 30_000;
async function mayUseDriveRooms(socket: { data: Record<string, any> }): Promise<boolean> {
  const userId: string | undefined = socket.data.userId;
  if (!userId) return false;
  const cached = socket.data.roleCheck as { at: number; ok: boolean } | undefined;
  if (cached && Date.now() - cached.at < ROLE_CACHE_MS) return cached.ok;
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  const ok = canSeeDrives(row?.role);
  socket.data.roleCheck = { at: Date.now(), ok };
  return ok;
}

const isDriveRoom = (room: string) => room.startsWith('drive_');

io.on('connection', (socket) => {
  socket.on('join_tracking', async (room) => {
    if (typeof room !== 'string' || !ROOM_PATTERN.test(room)) return;
    if (isDriveRoom(room) && !(await mayUseDriveRooms(socket))) return;
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
    if (isDriveRoom(room) && !(await mayUseDriveRooms(socket))) return;

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
