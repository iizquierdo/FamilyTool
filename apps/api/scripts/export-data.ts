
import "dotenv/config";
import { createRequire } from 'node:module';
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    const prisma = new PrismaClient({ adapter })

    try {
        const users = await prisma.user.findMany({
            include: {
                company: true
            }
        });

        const formattedUsers = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            company: u.company.name,
            avatar: u.avatar,
            lastLogin: 'Never',
            twoStep: false,
            joinedDate: u.createdAt.toLocaleDateString()
        }));

        const dataDir = path.join(process.cwd(), 'public', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(dataDir, 'users.json'),
            JSON.stringify(formattedUsers, null, 2)
        );

        console.log('Users exported successfully to public/data/users.json');
    } catch (e) {
        console.error('Error exporting users:', e);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
