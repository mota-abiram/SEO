/**
 * Create Admin User Script
 * Interactive CLI to create admin users
 */

const readline = require('readline');
const bcrypt = require('bcrypt');
const { query, pool } = require('../src/config/database');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function createAdmin() {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('👤 Create Admin User');
        console.log('='.repeat(60) + '\n');

        // Get email
        const email = await question('Email: ');

        if (!email || !email.includes('@')) {
            console.error('❌ Invalid email address');
            process.exit(1);
        }

        // Check if user already exists
        const existingUser = await query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            console.error(`❌ User with email ${email} already exists`);
            process.exit(1);
        }

        // Get password
        const password = await question('Password (min 8 characters): ');

        if (!password || password.length < 8) {
            console.error('❌ Password must be at least 8 characters');
            process.exit(1);
        }

        // Confirm password
        const confirmPassword = await question('Confirm password: ');

        if (password !== confirmPassword) {
            console.error('❌ Passwords do not match');
            process.exit(1);
        }

        console.log('\n🔐 Hashing password...');
        const passwordHash = await bcrypt.hash(password, 10);

        console.log('💾 Creating admin user...');
        const result = await query(
            `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'admin')
       RETURNING id, email, role, created_at`,
            [email, passwordHash]
        );

        const user = result.rows[0];

        console.log('\n✅ Admin user created successfully!\n');
        console.log('User Details:');
        console.log(`  ID: ${user.id}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  Role: ${user.role}`);
        console.log(`  Created: ${user.created_at}`);
        console.log('\n' + '='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ Error creating admin user:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        rl.close();
    }
}

// Run the script
createAdmin();
