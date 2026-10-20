// Usage: node scripts/create-admin.js admin@example.com "a-strong-password" [FirstName] [LastName]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { User, sequelize } = require('../src/models');

(async () => {
  const [email, password, firstName = 'Admin', lastName = 'User'] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('Usage: node scripts/create-admin.js <email> <password (min 8 chars)> [firstName] [lastName]');
    process.exit(1);
  }
  const normalized = email.trim().toLowerCase();
  const existing = await User.findOne({ where: { email: normalized } });
  if (existing) {
    await existing.update({ userType: 'admin' });
    console.log(`Existing user ${normalized} is now an admin.`);
  } else {
    await User.create({ firstName, lastName, email: normalized, password, phoneNumber: '+10000000000', userType: 'admin' });
    console.log(`Admin ${normalized} created.`);
  }
  await sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
