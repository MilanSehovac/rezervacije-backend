'use strict';
/**
 * End-to-end test against a throw-away database (reservations_test), never the dev DB.
 * Needs a reachable MySQL/MariaDB with the credentials from .env.
 */
process.env.DB_NAME = 'reservations_test';
process.env.AUTO_APPROVE_SALONS = 'true';
process.env.NODE_ENV = 'test';

const { execSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

let server;
let base;
let sequelize;

async function prepareDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await conn.query('DROP DATABASE IF EXISTS reservations_test');
  await conn.query('CREATE DATABASE reservations_test');
  await conn.end();
  execSync('npx sequelize-cli db:migrate', { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe' });
}

class Client {
  constructor() {
    this.cookie = '';
  }
  async call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, data };
  }
  get = (u) => this.call('GET', u);
  post = (u, b) => this.call('POST', u, b);
  put = (u, b) => this.call('PUT', u, b);
  patch = (u, b) => this.call('PATCH', u, b);
  del = (u) => this.call('DELETE', u);
}

async function signup(type, n) {
  const c = new Client();
  const email = `${type}${n}@example.com`;
  const reg = await c.post('/api/users', {
    firstName: 'T', lastName: type, email, password: 'password123', phoneNumber: '+38160111222', userType: type,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const login = await c.post('/api/users/login', { email, password: 'password123' });
  assert.equal(login.status, 200);
  return c;
}

/** Next Monday that is at least 2 days away, formatted YYYY-MM-DD and as a Date helper. */
function nextMonday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 2);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
const ymd = (d) => d.toISOString().slice(0, 10);
const atHM = (d, h, m = 0) => {
  const x = new Date(d);
  x.setUTCHours(h, m, 0, 0);
  return x.toISOString();
};

test.before(async () => {
  await prepareDatabase();
  const app = require('../src/app');
  ({ sequelize } = require('../src/models'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('active/passive scheduling through the real API', async () => {
  const owner = await signup('salon_owner', 1);
  const monday = nextMonday();

  // --- salon with a 30/60/30 color service, a plain 30 min cut and a legacy-style 45 min service
  const created = await owner.post('/api/salon/create', {
    businessName: 'Test Salon',
    category: 'hair-salon',
    email: 'salon@example.com',
    phone: '+38160123456',
    isApproved: false, // must be ignored/overridden
    timezone: 'UTC',
    daysOfOperation: Object.fromEntries(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, { enabled: true, open: '09:00', close: '18:00' }])
    ),
    services: [
      {
        id: 'hair_coloring', name: 'Color', price: 80, canOverlap: true,
        phases: [{ type: 'active', duration: 30 }, { type: 'passive', duration: 60 }, { type: 'active', duration: 30 }],
      },
      { id: 'haircut', name: 'Cut', price: 20, activeDuration: 30, passiveDuration: 0 },
      { id: 'legacy', name: 'Legacy', price: 10, activeDuration: 45, passiveDuration: 15, canOverlap: true },
    ],
    teamMembers: [],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const salon = created.data;
  assert.equal(salon.isApproved, true); // from AUTO_APPROVE_SALONS
  const color = salon.services.find((s) => s.name === 'Color');
  const cut = salon.services.find((s) => s.name === 'Cut');
  assert.equal(color.activeDuration, 60);
  assert.equal(color.passiveDuration, 60);

  const customers = [];
  for (let i = 1; i <= 6; i++) customers.push(await signup('user', i));

  const book = (c, service, h, m = 0) =>
    c.post('/api/bookings', { salonId: salon.id, serviceId: service.id, startAt: atHM(monday, h, m) });
  const slotTimes = async (service) => {
    const r = await customers[0].get(`/api/salon/${salon.id}/availability?serviceId=${service.id}&date=${ymd(monday)}`);
    assert.equal(r.status, 200);
    return r.data.slots.map((s) => new Date(s.startAt).getUTCHours() * 60 + new Date(s.startAt).getUTCMinutes());
  };

  // 1) color at 10:00 -> active 10:00-10:30, passive 10:30-11:30, active 11:30-12:00
  const first = await book(customers[0], color, 10);
  assert.equal(first.status, 201, JSON.stringify(first.data));

  // 2) a cut can use the passive hour, but not the active parts
  const slots = await slotTimes(cut);
  assert.ok(slots.includes(10 * 60 + 30), 'cut at 10:30 offered');
  assert.ok(slots.includes(11 * 60), 'cut at 11:00 offered');
  assert.ok(!slots.includes(10 * 60), 'cut at 10:00 must collide');
  assert.ok(!slots.includes(11 * 60 + 15), 'cut at 11:15 would hit the second active phase');
  assert.ok(!slots.includes(11 * 60 + 30), 'cut at 11:30 hits second active phase');
  assert.ok(slots.includes(12 * 60), 'cut at 12:00 offered');

  assert.equal((await book(customers[1], cut, 10, 30)).status, 201);
  assert.equal((await book(customers[2], cut, 11)).status, 201);
  const clash = await book(customers[3], cut, 10);
  assert.equal(clash.status, 409);
  assert.equal((await book(customers[3], cut, 11, 15)).status, 409);

  // 3) a second color can interleave into the free gaps (10:30 -> actives 10:30-11:00 collide with cut #1!)
  assert.equal((await book(customers[3], color, 10, 30)).status, 409);

  // 4) race: five customers fight for the same free slot, exactly one wins
  const race = await Promise.all(customers.slice(0, 5).map((c) => book(c, cut, 14)));
  assert.equal(race.filter((r) => r.status === 201).length, 1, JSON.stringify(race.map((r) => r.status)));
  assert.equal(race.filter((r) => r.status === 409).length, 4);

  // 5) cancelling frees the time
  const mine = await customers[1].get('/api/bookings/me');
  const cutBooking = mine.data.find((b) => b.serviceId === cut.id);
  assert.equal((await customers[1].patch(`/api/bookings/${cutBooking.id}/cancel`)).status, 200);
  assert.ok((await slotTimes(cut)).includes(10 * 60 + 30));

  // 6) outside working hours / past / closed
  assert.equal((await book(customers[4], cut, 17, 45)).status, 400);
  assert.equal((await book(customers[4], cut, 8)).status, 400);
  const past = await customers[4].post('/api/bookings', { salonId: salon.id, serviceId: cut.id, startAt: '2020-01-01T10:00:00Z' });
  assert.equal(past.status, 400);

  // 7) owner view + status rules
  const list = await owner.get('/api/bookings/salon');
  assert.equal(list.status, 200);
  assert.ok(list.data.length >= 3);
  const pending = list.data.find((b) => b.status === 'pending');
  assert.equal((await owner.patch(`/api/bookings/${pending.id}/status`, { status: 'confirmed' })).status, 200);
  assert.equal((await owner.patch(`/api/bookings/${pending.id}/status`, { status: 'completed' })).status, 400); // future
  const cancelled = list.data.find((b) => b.status === 'cancelled');
  assert.equal((await owner.patch(`/api/bookings/${cancelled.id}/status`, { status: 'confirmed' })).status, 400); // no revive

  // 8) customers cannot use owner endpoints
  assert.equal((await customers[0].get('/api/bookings/salon')).status, 403);
  assert.equal((await customers[0].put('/api/salon/me', { businessName: 'x' })).status, 403);

  // 9) staff: add a second stylist, parallel active phases become possible
  assert.equal((await owner.post('/api/salon/me/team', { name: 'Ana', role: 'Stylist' })).status, 201);
  assert.equal((await owner.post('/api/salon/me/team', { name: 'Bob', role: 'Stylist' })).status, 201);
  const noLongerBlocked = await book(customers[5], cut, 10); // active collides with color #1 only for ONE staff
  // legacy bookings without staffIds don't exist here, color #1 recorded the implicit staff 0, so a real stylist is free
  assert.equal(noLongerBlocked.status, 201, JSON.stringify(noLongerBlocked.data));

  // 9b) owner adds a brand new service with three phases (regression: serviceKey used to be required)
  const added = await owner.post('/api/salon/me/services', {
    name: 'Custom', price: 20, canOverlap: true, requiredStaff: 1,
    phases: [{ type: 'active', duration: 40 }, { type: 'passive', duration: 45 }, { type: 'active', duration: 30 }],
  });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  assert.equal(added.data.activeDuration, 70);
  assert.equal(added.data.passiveDuration, 45);
  assert.equal((await owner.post('/api/salon/me/services', { name: '', price: 5, phases: [{ type: 'active', duration: 10 }] })).status, 400);

  // 10) service editing: invalid phases rejected, valid accepted, deleting a used service archives it
  assert.equal((await owner.put(`/api/salon/me/services/${cut.id}`, { phases: [{ type: 'passive', duration: 10 }] })).status, 400);
  const edited = await owner.put(`/api/salon/me/services/${cut.id}`, { price: 25 });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.price, 25);
  const del = await owner.del(`/api/salon/me/services/${cut.id}`);
  assert.equal(del.data.archived, true);
  const pub = await customers[0].get(`/api/salon/${salon.id}`);
  assert.ok(!pub.data.services.some((s) => s.id === cut.id));
});

test('auth hardening', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/users', { firstName: 'a', lastName: 'b', email: 'x@y.com', password: 'short', phoneNumber: '+38160111222', userType: 'user' })).status, 400);
  assert.equal((await c.post('/api/users', { firstName: 'a', lastName: 'b', email: 'x@y.com', password: 'longenough1', phoneNumber: '+38160111222', userType: 'admin' })).status, 400);
  const u = await signup('user', 99);
  const upd = await u.put('/api/users/me', { firstName: 'New', userType: 'salon_owner', password: 'hacked' });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.user.password, undefined);
  assert.equal(upd.data.user.userType, 'user');
  const dup = await u.put('/api/users/me', { email: 'salon_owner1@example.com' });
  assert.equal(dup.status, 409);
});

test('reviews, admin approval and image upload', async () => {
  const { User } = require('../src/models');
  const owner = await signup('salon_owner', 50);
  const customer = await signup('user', 50);
  const monday = nextMonday();

  const created = await owner.post('/api/salon/create', {
    businessName: 'Second Salon', category: 'barber', email: 's2@example.com', phone: '+38160123457', timezone: 'UTC',
    daysOfOperation: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, { enabled: true, open: '09:00', close: '18:00' }])),
    services: [{ id: 'haircut', name: 'Cut', price: 20, activeDuration: 30, passiveDuration: 0 }],
  });
  assert.equal(created.status, 201);
  const salon = created.data;
  assert.equal((await owner.post('/api/salon/create', {})).status, 409);
  assert.equal((await owner.put('/api/salon/me', { timezone: 'Mars/Base' })).status, 400);

  // --- admin approval: hide, then show again
  const adminClient = await signup('user', 51);
  await User.update({ userType: 'admin' }, { where: { email: 'user51@example.com' } });
  assert.equal((await customer.get('/api/admin/salons')).status, 403);
  assert.equal((await adminClient.patch(`/api/admin/salons/${salon.id}`, { isApproved: false })).status, 200);
  assert.equal((await customer.get(`/api/salon/${salon.id}`)).status, 404);
  assert.equal((await owner.get(`/api/salon/${salon.id}`)).status, 200); // owner still sees it
  const pending = await adminClient.get('/api/admin/salons?status=pending');
  assert.ok(pending.data.some((s) => s.id === salon.id));
  assert.equal((await adminClient.patch(`/api/admin/salons/${salon.id}`, { isApproved: true })).status, 200);
  assert.equal((await customer.get(`/api/salon/${salon.id}`)).status, 200);

  // --- reviews need a completed booking
  const service = salon.services[0];
  const b = await customer.post('/api/bookings', { salonId: salon.id, serviceId: service.id, startAt: atHM(monday, 10) });
  assert.equal(b.status, 201);
  assert.equal((await customer.post(`/api/bookings/${b.data.id}/review`, { rating: 5 })).status, 400); // not completed
  // make it completed (the API only allows that once it started)
  const { Booking } = require('../src/models');
  await Booking.update({ status: 'completed', startAt: new Date(Date.now() - 7200e3), endAt: new Date(Date.now() - 3600e3) }, { where: { id: b.data.id } });
  assert.equal((await customer.post(`/api/bookings/${b.data.id}/review`, { rating: 9 })).status, 400);
  assert.equal((await customer.post(`/api/bookings/${b.data.id}/review`, { rating: 4, comment: 'Great' })).status, 201);
  assert.equal((await customer.post(`/api/bookings/${b.data.id}/review`, { rating: 4 })).status, 409);
  const other = await signup('user', 52);
  assert.equal((await other.post(`/api/bookings/${b.data.id}/review`, { rating: 1 })).status, 404);
  const reviews = await customer.get(`/api/salon/${salon.id}/reviews`);
  assert.equal(reviews.data.length, 1);
  assert.equal(reviews.data[0].rating, 4);
  const detail = await customer.get(`/api/salon/${salon.id}`);
  assert.equal(detail.data.rating, 4);
  assert.equal(detail.data.reviewCount, 1);

  // --- image upload
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'));
  const form = new FormData();
  form.append('images', new Blob([png], { type: 'image/png' }), 'x.png');
  const up = await fetch(`${base}/api/salon/me/images`, { method: 'POST', headers: { cookie: owner.cookie }, body: form });
  assert.equal(up.status, 201);
  const { images } = await up.json();
  assert.equal(images.length, 1);
  const file = await fetch(images[0]);
  assert.equal(file.status, 200);
  const bad = new FormData();
  bad.append('images', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
  assert.equal((await fetch(`${base}/api/salon/me/images`, { method: 'POST', headers: { cookie: owner.cookie }, body: bad })).status, 400);
  assert.equal((await owner.del('/api/salon/me/images')).status, 404); // no body -> not found
  const delRes = await fetch(`${base}/api/salon/me/images`, { method: 'DELETE', headers: { cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: images[0] }) });
  assert.equal(delRes.status, 200);
});

test('notifications, reminders, favorites and derived price level', async () => {
  const { Booking } = require('../src/models');
  const { sendDueReminders } = require('../src/services/notifications');
  const waitFor = async (fn) => {
    for (let i = 0; i < 40; i++) {
      const v = await fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  const types = async (c) => (await c.get('/api/notifications')).data.notifications.map((n) => n.type);

  const owner = await signup('salon_owner', 70);
  const customer = await signup('user', 70);
  const other = await signup('user', 71);
  const monday = nextMonday();

  const created = await owner.post('/api/salon/create', {
    businessName: 'Notify Salon', category: 'hair-salon', email: 'n@example.com', phone: '+38160123458', timezone: 'UTC',
    daysOfOperation: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, { enabled: true, open: '09:00', close: '18:00' }])),
    services: [
      { id: 'a', name: 'Cheap', price: 20, activeDuration: 30, passiveDuration: 0 },
      { id: 'b', name: 'Premium', price: 120, activeDuration: 30, passiveDuration: 0 },
    ],
  });
  const salon = created.data;
  const cheap = salon.services.find((s) => s.name === 'Cheap');

  // price level is derived: avg 70 -> $$$, min/max exposed
  const pub = await customer.get(`/api/salon/${salon.id}`);
  assert.equal(pub.data.priceRange, '$$$');
  assert.equal(pub.data.minPrice, 20);
  assert.equal(pub.data.maxPrice, 120);

  // --- booking request reaches the owner
  const b1 = await customer.post('/api/bookings', { salonId: salon.id, serviceId: cheap.id, startAt: atHM(monday, 10) });
  assert.equal(b1.status, 201);
  assert.ok(await waitFor(async () => (await types(owner)).includes('booking_requested')));
  const ownerInbox = (await owner.get('/api/notifications')).data;
  assert.equal(ownerInbox.unreadCount, 1);
  assert.match(ownerInbox.notifications[0].message, /Cheap/);

  // --- no reminder while the booking is still pending
  const start = new Date(atHM(monday, 10)).getTime();
  const countOf = async (c, type, bookingId) =>
    (await c.get('/api/notifications')).data.notifications.filter((n) => n.type === type && n.bookingId === bookingId).length;
  await sendDueReminders(start - 3600e3 * 23);
  assert.equal(await countOf(customer, 'reminder_24h', b1.data.id), 0);

  // --- owner confirms -> customer is told; reminders then follow (24 h once, 1 h once)
  assert.equal((await owner.patch(`/api/bookings/${b1.data.id}/status`, { status: 'confirmed' })).status, 200);
  assert.ok(await waitFor(async () => (await types(customer)).includes('booking_confirmed')));
  await sendDueReminders(start - 3600e3 * 23);
  await sendDueReminders(start - 3600e3 * 22); // must not duplicate
  assert.equal(await countOf(customer, 'reminder_24h', b1.data.id), 1);
  assert.equal(await countOf(customer, 'reminder_1h', b1.data.id), 0);
  await sendDueReminders(start - 1800e3);
  await sendDueReminders(start - 1700e3);
  assert.equal(await countOf(customer, 'reminder_1h', b1.data.id), 1);

  // reminders can be switched off
  assert.equal((await other.put('/api/users/me/notifications', { reminders: false })).status, 200);
  assert.equal((await other.put('/api/users/me/notifications', { reminders: 'no' })).status, 400);
  const b2 = await other.post('/api/bookings', { salonId: salon.id, serviceId: cheap.id, startAt: atHM(monday, 12) });
  await owner.patch(`/api/bookings/${b2.data.id}/status`, { status: 'confirmed' });
  await waitFor(async () => (await types(other)).includes('booking_confirmed'));
  await sendDueReminders(new Date(atHM(monday, 12)).getTime() - 3600e3 * 23);
  assert.ok(!(await types(other)).includes('reminder_24h'));

  // --- decline of a pending booking, cancellation by customer
  const b3 = await other.post('/api/bookings', { salonId: salon.id, serviceId: cheap.id, startAt: atHM(monday, 14) });
  assert.equal((await owner.patch(`/api/bookings/${b3.data.id}/status`, { status: 'cancelled' })).status, 200);
  assert.ok(await waitFor(async () => (await types(other)).includes('booking_declined')));
  assert.equal((await customer.patch(`/api/bookings/${b1.data.id}/cancel`)).status, 200);
  assert.ok(await waitFor(async () => (await types(owner)).includes('booking_cancelled_by_customer')));

  // --- completed
  const b4 = await customer.post('/api/bookings', { salonId: salon.id, serviceId: cheap.id, startAt: atHM(monday, 16) });
  await Booking.update({ startAt: new Date(Date.now() - 7200e3), endAt: new Date(Date.now() - 3600e3) }, { where: { id: b4.data.id } });
  await owner.patch(`/api/bookings/${b4.data.id}/status`, { status: 'completed' });
  assert.ok(await waitFor(async () => (await types(customer)).includes('booking_completed')));

  // --- reading
  const inbox = (await customer.get('/api/notifications')).data;
  assert.ok(inbox.unreadCount > 0);
  assert.equal((await other.patch(`/api/notifications/${inbox.notifications[0].id}/read`)).status, 404); // not theirs
  assert.equal((await customer.patch(`/api/notifications/${inbox.notifications[0].id}/read`)).status, 200);
  assert.equal((await customer.post('/api/notifications/read-all')).status, 200);
  assert.equal((await customer.get('/api/notifications')).data.unreadCount, 0);
  assert.equal((await new Client().get('/api/notifications')).status, 401);

  // --- favorites
  assert.equal((await customer.put(`/api/favorites/${salon.id}`)).status, 200);
  assert.equal((await customer.put(`/api/favorites/${salon.id}`)).status, 200); // idempotent
  assert.equal((await customer.put('/api/favorites/99999')).status, 404);
  assert.deepEqual((await customer.get('/api/favorites/ids')).data, [salon.id]);
  const favs = await customer.get('/api/favorites');
  assert.equal(favs.data.length, 1);
  assert.equal(favs.data[0].priceRange, '$$$');
  assert.deepEqual((await other.get('/api/favorites/ids')).data, []);
  assert.equal((await customer.del(`/api/favorites/${salon.id}`)).status, 200);
  assert.deepEqual((await customer.get('/api/favorites/ids')).data, []);
});

test('booking management: rules, reschedule, manual bookings and blocked time', async () => {
  const waitFor = async (fn) => {
    for (let i = 0; i < 40; i++) {
      const v = await fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  const types = async (c) => (await c.get('/api/notifications')).data.notifications.map((n) => n.type);

  const owner = await signup('salon_owner', 80);
  const alice = await signup('user', 80);
  const bob = await signup('user', 81);
  const monday = nextMonday();
  const day = ymd(monday);

  const created = await owner.post('/api/salon/create', {
    businessName: 'Rules Salon', category: 'barber', email: 'r@example.com', phone: '+38160123459', timezone: 'UTC',
    daysOfOperation: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, { enabled: true, open: '09:00', close: '18:00' }])),
    services: [{ id: 'cut', name: 'Cut', price: 20, activeDuration: 30, passiveDuration: 0 }],
  });
  assert.equal(created.status, 201);
  const salon = created.data;
  const cut = salon.services[0];
  const book = (c, h, m = 0) => c.post('/api/bookings', { salonId: salon.id, serviceId: cut.id, startAt: atHM(monday, h, m) });
  const slots = async (c, extra = '') => {
    const r = await c.get(`/api/salon/${salon.id}/availability?serviceId=${cut.id}&date=${day}${extra}`);
    return r.data.slots.map((s) => new Date(s.startAt).getUTCHours() * 60 + new Date(s.startAt).getUTCMinutes());
  };

  // owner cannot book their own salon as a customer
  assert.equal((await book(owner, 10)).status, 400);

  // --- reschedule
  const a1 = await book(alice, 10);
  assert.equal(a1.status, 201);
  assert.equal((await owner.patch(`/api/bookings/${a1.data.id}/status`, { status: 'confirmed' })).status, 200);
  // a second booking of the same customer at an overlapping time is refused
  assert.equal((await book(alice, 10, 15)).status, 409);
  // availability for the customer's own move does not count the booking itself
  assert.ok(!(await slots(bob)).includes(10 * 60));
  assert.ok((await slots(alice, `&excludeBookingId=${a1.data.id}`)).includes(10 * 60));
  const b1 = await book(bob, 11);
  assert.equal(b1.status, 201);
  assert.equal((await alice.patch(`/api/bookings/${a1.data.id}/reschedule`, { startAt: atHM(monday, 11) })).status, 409); // taken by bob
  assert.equal((await bob.patch(`/api/bookings/${a1.data.id}/reschedule`, { startAt: atHM(monday, 13) })).status, 404); // not bob's
  const moved = await alice.patch(`/api/bookings/${a1.data.id}/reschedule`, { startAt: atHM(monday, 13) });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.status, 'pending'); // confirmed time moved -> needs OK again
  assert.ok(await waitFor(async () => (await types(owner)).includes('booking_rescheduled')));
  const free = await slots(bob);
  assert.ok(free.includes(10 * 60) && !free.includes(13 * 60));
  // confirming again notifies the customer again
  await owner.patch(`/api/bookings/${a1.data.id}/status`, { status: 'confirmed' });
  assert.ok(await waitFor(async () => (await alice.get('/api/notifications')).data.notifications.filter((n) => n.type === 'booking_confirmed').length === 1));

  // --- manual (walk-in) booking blocks the slot and shows the guest name
  const manual = await owner.post('/api/bookings/salon/manual', { serviceId: cut.id, startAt: atHM(monday, 15), guestName: 'Walk In', guestPhone: '+38160999888' });
  assert.equal(manual.status, 201, JSON.stringify(manual.data));
  assert.equal(manual.data.status, 'confirmed');
  assert.equal((await book(bob, 15)).status, 409);
  assert.equal((await owner.post('/api/bookings/salon/manual', { serviceId: cut.id, startAt: atHM(monday, 16) })).status, 400); // name required
  assert.equal((await customerGet(alice)).status, 403);
  const ownerList = await owner.get('/api/bookings/salon');
  assert.ok(ownerList.data.some((b) => b.guestName === 'Walk In' && b.customer === null));

  // --- blocked time (lunch)
  const lunch = await owner.post('/api/salon/me/blocked', { startAt: atHM(monday, 12), endAt: atHM(monday, 12, 30), reason: 'Lunch' });
  assert.equal(lunch.status, 201, JSON.stringify(lunch.data));
  assert.ok(!(await slots(bob)).includes(12 * 60));
  assert.equal((await book(bob, 12)).status, 409);
  assert.equal((await owner.post('/api/salon/me/blocked', { startAt: atHM(monday, 11), endAt: atHM(monday, 11, 30) })).status, 409); // bob is there
  assert.equal((await owner.post('/api/salon/me/blocked', { startAt: atHM(monday, 12), endAt: atHM(monday, 11) })).status, 400);
  assert.equal((await owner.del(`/api/salon/me/blocked/${lunch.data.id}`)).status, 200);
  assert.ok((await slots(bob)).includes(12 * 60));

  // --- salon rules: notice, cancellation window, auto confirm
  assert.equal((await owner.put('/api/salon/me', { minNoticeHours: 720 })).status, 200);
  assert.equal((await book(bob, 9)).status, 400);
  assert.deepEqual(await slots(bob), []);
  assert.equal((await owner.put('/api/salon/me', { minNoticeHours: 1, cancellationHours: 720 })).status, 200);
  assert.equal((await bob.patch(`/api/bookings/${b1.data.id}/cancel`)).status, 400);
  assert.equal((await bob.patch(`/api/bookings/${b1.data.id}/reschedule`, { startAt: atHM(monday, 9) })).status, 400);
  assert.equal((await owner.patch(`/api/bookings/${b1.data.id}/status`, { status: 'cancelled' })).status, 200); // owner is not bound by it
  assert.equal((await owner.put('/api/salon/me', { cancellationHours: 0, autoConfirm: true })).status, 200);
  const auto = await book(bob, 9);
  assert.equal(auto.status, 201);
  assert.equal(auto.data.status, 'confirmed');
  assert.ok(await waitFor(async () => (await types(bob)).includes('booking_confirmed')));
  assert.equal((await owner.put('/api/salon/me', { minNoticeHours: -1 })).status, 400);
  assert.equal((await owner.put('/api/salon/me', { autoConfirm: 'yes' })).status, 400);
});

async function customerGet(c) {
  return c.get('/api/bookings/salon');
}

test('public endpoints, SEO files and account management', async () => {
  const anon = new Client();
  const stats = await anon.get('/api/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.data.salons >= 1);
  assert.equal((await anon.get('/api/reviews/recent')).status, 200);

  const robots = await fetch(`${base}/robots.txt`);
  const robotsText = await robots.text();
  assert.match(robotsText, /Disallow: \/salon\/dashboard/);
  assert.match(robotsText, /Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sitemap, /<urlset/);
  assert.match(sitemap, /\/salon\/\d+-[a-z0-9-]+<\/loc>/); // slug urls

  // change password
  const u = await signup('user', 90);
  assert.equal((await u.post('/api/users/me/password', { currentPassword: 'wrong-password', newPassword: 'newpassword1' })).status, 400);
  assert.equal((await u.post('/api/users/me/password', { currentPassword: 'password123', newPassword: 'short' })).status, 400);
  assert.equal((await u.post('/api/users/me/password', { currentPassword: 'password123', newPassword: 'newpassword1' })).status, 200);
  assert.equal((await new Client().post('/api/users/login', { email: 'user90@example.com', password: 'password123' })).status, 401);
  assert.equal((await new Client().post('/api/users/login', { email: 'user90@example.com', password: 'newpassword1' })).status, 200);

  // delete account
  assert.equal((await u.del('/api/users/me')).status, 400); // password required
  const del = await fetch(`${base}/api/users/me`, { method: 'DELETE', headers: { cookie: u.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'newpassword1' }) });
  assert.equal(del.status, 200);
  assert.equal((await new Client().post('/api/users/login', { email: 'user90@example.com', password: 'newpassword1' })).status, 401);
});
