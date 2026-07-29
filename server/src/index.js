import path from 'node:path';
import { config, repoRoot } from './config.js';
import { migrate, driverName } from './db.js';
import { createApp } from './app.js';

await migrate();

createApp().listen(config.port, async () => {
  console.log(`\n  Frido-as-a-Service API on http://localhost:${config.port}`);
  console.log(
    `  env=${config.env}  driver=${await driverName()}  db=${path.relative(repoRoot, config.databaseFile)}`,
  );
  if (config.otp.echo) {
    console.log('  DEV_OTP_ECHO is ON — OTPs are returned in API responses. Never do this in prod.\n');
  } else {
    console.log('');
  }
});
