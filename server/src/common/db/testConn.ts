import { db } from './index';
import { sql } from 'drizzle-orm';

async function testConnection() {
  try {
    console.log('🔌 Testing Docker PostgreSQL connection on port 5433...');
    const result = await db.execute(sql`SELECT current_database(), version()`);
    console.log('✅ Connection Successful!', result);
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection Failed:', err);
    process.exit(1);
  }
}

testConnection();
