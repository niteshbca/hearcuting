import readline from 'readline';
import crypto from 'crypto';
import { connectDB, disconnectDB, createAllIndexes } from '../config/db';
import { User } from '../models/User';
import { StaffProfile } from '../models/StaffProfile';
import { hashPassword } from '../services/auth.service';
import { ensureBusinessHours, getSettings } from '../services/settings.service';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

function prompt(question: string, silent = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (silent) {
    const stdout = process.stdout as NodeJS.WriteStream & { _writeToOutput?: (s: string) => void };
    rl.stdoutMuted = true;
    rl._writeToOutput = function (stringToWrite: string) {
      if (!rl.stdoutMuted) process.stdout.write(stringToWrite);
      else if (stringToWrite.includes('\n')) process.stdout.write('\n');
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (silent) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

declare module 'readline' {
  interface Interface {
    stdoutMuted?: boolean;
    _writeToOutput?: (s: string) => void;
  }
}

function strongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += chars[bytes[i] % chars.length];
  return `${out}Aa1`; // guarantees letter+number requirements
}

async function main() {
  const reset = process.argv.includes('--reset');
  await connectDB();
  await createAllIndexes();
  await getSettings();
  await ensureBusinessHours();

  let email = process.env.OWNER_EMAIL?.trim();
  let name = process.env.OWNER_NAME?.trim() || 'Salon Owner';
  let password = process.env.OWNER_PASSWORD?.trim();

  if (!email && process.stdin.isTTY) {
    email = await prompt('Owner email: ');
  }
  if (!email) {
    console.error('OWNER_EMAIL is required (set it in server/.env or run interactively).');
    process.exit(1);
  }

  const existing = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  if (existing && !reset) {
    if (existing.role === 'owner') {
      console.log(`\nOwner account already exists for ${email} (id: ${existing._id}).`);
      console.log('Use --reset to set a new password, or sign in at /admin/login.\n');
      await disconnectDB();
      return;
    }
    console.error(`A non-owner account already uses ${email}. Choose another email.`);
    process.exit(1);
  }

  if (!password) {
    if (process.stdin.isTTY && !isProd()) {
      const typed = await prompt('Owner password (Enter to auto-generate): ', true);
      password = typed || strongPassword();
    } else {
      password = strongPassword();
    }
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  let user;
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'owner';
    existing.isActive = true;
    existing.sessions = [];
    await existing.save();
    user = existing;
  } else {
    user = await User.create({
      email: email.toLowerCase(),
      name,
      passwordHash,
      role: 'owner',
      isActive: true,
      isEmailVerified: true,
    });
  }

  // Owners are also staff members so they can be assigned appointments if desired.
  const staff = await StaffProfile.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      $set: {
        user: user._id,
        name,
        email: email.toLowerCase(),
        phone: process.env.OWNER_PHONE || '0000000000',
        role: 'manager',
        isActive: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!user.staff) {
    user.staff = staff._id;
    await user.save();
  }

  console.log('\n=================================================');
  console.log(existing ? ' Owner password reset successfully' : ' Owner account created successfully');
  console.log('=================================================');
  console.log(` Email:    ${email}`);
  if (!process.env.OWNER_PASSWORD || reset) {
    console.log(` Password: ${password}`);
    console.log(' (store this in your password manager — it is shown only once)');
  } else {
    console.log(' Password: (from OWNER_PASSWORD env)');
  }
  console.log(` Login at: http://localhost:5173/admin/login`);
  console.log('=================================================\n');

  await disconnectDB();
}

main().catch((err) => {
  logger.fatal({ err }, 'create-owner failed');
  process.exit(1);
});
