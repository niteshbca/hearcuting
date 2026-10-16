import crypto from 'crypto';
import { connectDB, disconnectDB, createAllIndexes } from '../config/db';
import { logger } from '../config/logger';
import { User } from '../models/User';
import { CustomerProfile } from '../models/CustomerProfile';
import { StaffProfile } from '../models/StaffProfile';
import { Service } from '../models/Service';
import { Appointment } from '../models/Appointment';
import { Expense } from '../models/Salon';
import { Review } from '../models/Salon';
import { Product, Supplier, InventoryTransaction } from '../models/Inventory';
import { Membership, MembershipPlan } from '../models/Membership';
import { createInvoice } from '../services/billing.service';
import { ensureBusinessHours, getSettings } from '../services/settings.service';
import { hashPassword } from '../services/auth.service';
import { bookingReference, shortCode } from '../utils/reference';
import { addDays, localDateKey, zonedTimeToUTC } from '../utils/time';
import { round2 } from '../utils/money';

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Salon@1234';
const DEMO_PREFIX = 'seed';

const U = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const IMG = {
  hero: [
    U('photo-1585747860715-2ba37e788b70'),
    U('photo-1521590832167-7bcbfaa6381f'),
    U('photo-1560066984-138dadb4c035'),
    U('photo-1519500099198-fd81846b8f03'),
  ],
  service: [
    U('photo-1585747860715-2ba37e788b70'),
    U('photo-1522337360788-8b13dee7a37e'),
    U('photo-1521590832167-7bcbfaa6381f'),
    U('photo-1560066984-138dadb4c035'),
    U('photo-1517832606299-7ae9b720a186'),
    U('photo-1599351431202-1e0f0137899a'),
  ],
  staff: [
    U('photo-1500648767791-00dcc994a43e', 600),
    U('photo-1507003211169-0a1dd7228f2d', 600),
    U('photo-1494790108377-be9c29b29330', 600),
    U('photo-1472099645785-5658abf4ff4e', 600),
  ],
  product: [
    U('photo-1522338242992-e1a54906a8da', 600),
    U('photo-1556228578-8c89e6adf883', 600),
    U('photo-1608248543803-ba4f8c70ae0b', 600),
    U('photo-1596462502278-27bfdc403348', 600),
    U('photo-1621607512214-68297480165e', 600),
    U('photo-1605497788044-5a32c7078486', 600),
  ],
  avatar: [
    U('photo-1500648767791-00dcc994a43e', 200),
    U('photo-1438761681033-6461ffad8d80', 200),
    U('photo-1472099645785-5658abf4ff4e', 200),
    U('photo-1494790108377-be9c29b29330', 200),
    U('photo-1507003211169-0a1dd7228f2d', 200),
    U('photo-1438761681033-6461ffad8d80', 200),
  ],
  gallery: [
    { url: U('photo-1585747860715-2ba37e788b70'), caption: 'Signature barbershop', category: 'Interior' },
    { url: U('photo-1503951914875-452162b0f3f1'), caption: 'Precision cut', category: 'Haircut' },
    { url: U('photo-1521590832167-7bcbfaa6381f'), caption: 'Colour studio', category: 'Coloring' },
    { url: U('photo-1560066984-138dadb4c035'), caption: 'Relaxation lounge', category: 'Interior' },
    { url: U('photo-1522337360788-8b13dee7a37e'), caption: 'Beard grooming', category: 'Beard' },
    { url: U('photo-1517832606299-7ae9b720a186'), caption: 'Hair styling', category: 'Styling' },
    { url: U('photo-1599351431202-1e0f0137899a'), caption: 'Spa ritual', category: 'Spa' },
    { url: U('photo-1519500099198-fd81846b8f03'), caption: 'Reception', category: 'Interior' },
    { url: U('photo-1596178065887-1198b6148b2b'), caption: 'Happy clients', category: 'Salon' },
  ],
} as const;


function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function upsertUser(params: {
  email: string;
  name: string;
  role: 'owner' | 'manager' | 'receptionist' | 'barber' | 'accountant' | 'customer';
  phone: string;
  passwordHash: string;
}) {
  const email = params.email.toLowerCase();
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      name: params.name,
      phone: params.phone,
      role: params.role,
      passwordHash: params.passwordHash,
      isEmailVerified: true,
      isActive: true,
    });
  }
  return user;
}

async function main() {
  const force = process.argv.includes('--force');
  await connectDB();
  await createAllIndexes();

  const settings = await getSettings();
  await ensureBusinessHours();

  const existingServices = await Service.countDocuments();
  if (existingServices > 0 && !force) {
    logger.warn('Seed data already present. Re-run with --force to seed again (duplicates possible).');
    await disconnectDB();
    return;
  }

  const passwordHash = await hashPassword(SEED_PASSWORD);

  // ---------- Services ----------
  const serviceDefs = [
    { name: 'Classic Haircut', category: 'Haircut', price: 300, durationMinutes: 30, description: 'Precision cut finished with a hot towel and styling.' },
    { name: 'Beard Trim & Shape', category: 'Beard', price: 150, durationMinutes: 20, description: 'Beard sculpting with razor line-up and beard oil finish.' },
    { name: 'Hair Wash & Conditioning', category: 'Hair Care', price: 200, durationMinutes: 20, description: 'Deep-cleansing wash with scalp massage and conditioner.' },
    { name: 'Gold Facial', category: 'Facial', price: 800, durationMinutes: 45, description: '24K gold facial for instant glow and hydration.' },
    { name: 'Global Hair Color', category: 'Coloring', price: 1500, durationMinutes: 90, description: 'Ammonia-free global colour with gloss finish.' },
    { name: 'Hair Styling', category: 'Styling', price: 400, durationMinutes: 30, description: 'Blow-dry, curls or sleek styling for events.' },
  ] as const;

  const services = [];
  for (const [i, def] of serviceDefs.entries()) {
    const service = await Service.create({
      name: def.name,
      slug: def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: def.category,
      description: def.description,
      imageUrls: [IMG.service[i]],
      price: def.price,
      durationMinutes: def.durationMinutes,
      bufferMinutes: 5,
      sortOrder: i,
      isActive: true,
      bookingRules: {
        minNoticeHours: 2,
        maxAdvanceDays: 60,
        allowGuest: true,
        requireApproval: false,
        onlinePaymentAllowed: true,
      },
    });
    services.push(service);
  }

  // ---------- Staff ----------
  const weekly = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    isWorking: day !== 1, // closed Mondays for staff
    start: '10:00',
    end: '20:00',
    breaks: [{ start: '13:30', end: '14:15' }],
  }));

  const staffDefs = [
    { name: 'Rahul Sharma', email: `${DEMO_PREFIX}.rahul@salonpro.local`, role: 'barber', specialties: ['Haircut', 'Beard', 'Styling'], commissionPercent: 25 },
    { name: 'Imran Qureshi', email: `${DEMO_PREFIX}.imran@salonpro.local`, role: 'barber', specialties: ['Coloring', 'Facial', 'Hair Care'], commissionPercent: 30 },
    { name: 'Priya Nair', email: `${DEMO_PREFIX}.priya@salonpro.local`, role: 'receptionist', specialties: [], commissionPercent: 0 },
    { name: 'Anil Kumar', email: `${DEMO_PREFIX}.anil@salonpro.local`, role: 'accountant', specialties: [], commissionPercent: 0 },
  ] as const;

  const barbers = [];
  for (const [si, def] of staffDefs.entries()) {
    const user = await upsertUser({
      email: def.email,
      name: def.name,
      role: def.role,
      phone: `98${randomInt(10000000, 99999999)}`,
      passwordHash,
    });
    const staff = await StaffProfile.create({
      user: user._id,
      name: def.name,
      email: def.email,
      phone: user.phone ?? '9800000000',
      photoUrl: IMG.staff[si],
      role: def.role,
      specialties: [...def.specialties],
      services: def.role === 'barber' ? services.map((s) => s._id) : [],
      weeklySchedule: weekly,
      employmentType: 'full_time',
      salary: def.role === 'barber' ? 25000 : 30000,
      commissionPercent: def.commissionPercent,
      isActive: true,
      joiningDate: new Date('2024-01-15'),
    });
    user.staff = staff._id;
    if (def.role === 'barber') barbers.push(staff);
    await user.save();
  }

  // Ensure each barber is eligible for its services
  for (const barber of barbers) {
    await StaffProfile.updateOne({ _id: barber._id }, { $set: { services: services.map((s) => s._id) } });
  }
  for (const service of services) {
    await Service.updateOne({ _id: service._id }, { $set: { staff: barbers.map((b) => b._id) } });
  }

  // ---------- Customers ----------
  const customerDefs = [
    ['Aarav Mehta', 'aarav.mehta@example.com'],
    ['Sneha Kapoor', 'sneha.kapoor@example.com'],
    ['Vikram Singh', 'vikram.singh@example.com'],
    ['Neha Verma', 'neha.verma@example.com'],
    ['Rohan Gupta', 'rohan.gupta@example.com'],
    ['Ananya Iyer', 'ananya.iyer@example.com'],
    ['Kabir Malhotra', 'kabir.malhotra@example.com'],
    ['Meera Joshi', 'meera.joshi@example.com'],
  ];

  const customers = [];
  for (const [name, email] of customerDefs) {
    const user = await upsertUser({
      email,
      name,
      role: 'customer',
      phone: `97${randomInt(10000000, 99999999)}`,
      passwordHash,
    });
    const profile = await CustomerProfile.create({
      user: user._id,
      name,
      email,
      phone: user.phone ?? '9700000000',
      source: 'website',
      tags: rnd([['regular'], ['vip'], [], ['new']]),
      preferredStaff: barbers[0]._id,
    });
    user.customer = profile._id;
    await user.save();
    customers.push(profile);
  }

  // ---------- Appointments (past + today + upcoming) ----------
  const slots = ['10:00', '11:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  let created = 0;

  for (let dayOffset = -20; dayOffset <= 6; dayOffset++) {
    const dateKey = addDays(localDateKey(), dayOffset);
    const perDay = dayOffset <= 0 ? randomInt(2, 4) : randomInt(2, 5);
    const used = new Set<string>();

    for (let i = 0; i < perDay; i++) {
      const staff = rnd(barbers);
      const slot = rnd(slots);
      const key = `${staff._id}:${slot}`;
      if (used.has(key)) continue;
      used.add(key);

      const service = rnd(services);
      const customer = rnd(customers);
      const startsAt = zonedTimeToUTC(dateKey, slot, settings.timezone);
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

      let status: 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'pending';
      if (dayOffset < 0) status = rnd(['completed', 'completed', 'completed', 'cancelled', 'no_show'] as const);
      else if (dayOffset === 0) status = rnd(['completed', 'confirmed', 'in_progress'] as const) as never;
      else status = rnd(['confirmed', 'confirmed', 'pending'] as const);

      const appointment = await Appointment.create({
        reference: bookingReference(),
        customer: customer._id,
        customerUser: customer.user,
        staff: staff._id,
        service: service._id,
        serviceSnapshot: {
          name: service.name,
          category: service.category,
          price: service.price,
          durationMinutes: service.durationMinutes,
        },
        date: dateKey,
        startsAt,
        endsAt,
        status,
        paymentStatus: status === 'completed' ? 'paid' : status === 'cancelled' || status === 'no_show' ? 'unpaid' : 'unpaid',
        source: rnd(['website', 'walk_in', 'phone'] as const),
        totalPrice: service.price,
        completedAt: status === 'completed' ? endsAt : undefined,
        cancelledAt: status === 'cancelled' ? startsAt : undefined,
        cancelReason: status === 'cancelled' ? 'Customer requested' : undefined,
      });
      created++;

      if (status === 'completed') {
        await createInvoice({
          customer: String(customer._id),
          customerUser: String(customer.user),
          appointment: String(appointment._id),
          items: [
            {
              type: 'service',
              refId: String(service._id),
              quantity: 1,
              staff: String(staff._id),
            },
          ],
          taxRate: 0,
          payments: [
            { method: rnd(['cash', 'upi', 'card'] as const), amount: service.price, provider: 'manual' },
          ],
          createdBy: undefined,
        });
      }
    }
  }

  // ---------- Products & inventory ----------
  const supplier = await Supplier.create({
    name: 'Grooming Wholesale Co.',
    contactPerson: 'Deepak Traders',
    phone: '9811122233',
    email: 'sales@groomingwholesale.example',
  });

  const productDefs = [
    { name: 'Argan Hair Shampoo 500ml', sku: 'SH-500', costPrice: 220, salePrice: 399, stock: 24 },
    { name: 'Beard Oil Premium 50ml', sku: 'BO-050', costPrice: 180, salePrice: 349, stock: 15 },
    { name: 'Hair Gel Strong Hold 200ml', sku: 'HG-200', costPrice: 110, salePrice: 249, stock: 8 },
    { name: 'Hair Color Cream Black', sku: 'HC-BLK', costPrice: 260, salePrice: 499, stock: 3 },
    { name: 'Shaving Foam 150ml', sku: 'SF-150', costPrice: 95, salePrice: 199, stock: 30 },
    { name: 'Hair Serum Repair 100ml', sku: 'HS-100', costPrice: 310, salePrice: 599, stock: 4 },
  ];

  for (const [pi, def] of productDefs.entries()) {
    const product = await Product.create({
      name: def.name,
      slug: def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      sku: def.sku,
      category: 'Retail',
      costPrice: def.costPrice,
      salePrice: def.salePrice,
      stockQuantity: def.stock,
      lowStockThreshold: 5,
      suppliers: [supplier._id],
      imageUrls: [IMG.product[pi]],
      isRetail: true,
    });
    await InventoryTransaction.create({
      product: product._id,
      type: 'in',
      quantity: def.stock,
      balanceAfter: def.stock,
      refType: 'purchase',
      unitCost: def.costPrice,
      notes: 'Opening stock (seed)',
    });
  }

  // ---------- Membership plans + one active membership ----------
  const plans = await MembershipPlan.insertMany([
    {
      name: '6 Haircuts Package',
      slug: 'six-haircuts-package',
      type: 'package',
      description: 'Six classic haircuts valid for 6 months.',
      price: 1500,
      validityDays: 180,
      includes: [{ service: services[0]._id, serviceName: 'Classic Haircut', limitTotal: 6 }],
      sortWeight: 1,
    },
    {
      name: 'Gold Monthly Membership',
      slug: 'gold-monthly-membership',
      type: 'membership',
      description: 'One haircut + one beard trim every month with 10% off other services.',
      price: 999,
      validityDays: 30,
      includes: [
        { service: services[0]._id, serviceName: 'Classic Haircut', limitTotal: 1 },
        { service: services[1]._id, serviceName: 'Beard Trim & Shape', limitTotal: 1, discountPercent: 100 },
      ],
      sortWeight: 2,
    },
  ]);

  const validFrom = new Date();
  await Membership.create({
    customer: customers[0]._id,
    plan: plans[0]._id,
    name: '6 Haircuts Package',
    type: 'package',
    code: shortCode(),
    price: 1500,
    validFrom,
    validUntil: new Date(validFrom.getTime() + 180 * 24 * 3600 * 1000),
    includes: [{ service: services[0]._id, serviceName: 'Classic Haircut', limitTotal: 6, limitUsed: 1 }],
    status: 'active',
  });

  // ---------- Expenses ----------
  const expenseDefs = [
    { category: 'rent', title: 'Shop rent', amount: 45000 },
    { category: 'electricity', title: 'Electricity bill', amount: 6800 },
    { category: 'salaries', title: 'Staff salaries', amount: 90000 },
    { category: 'supplies', title: 'Grooming supplies restock', amount: 12500 },
    { category: 'maintenance', title: 'AC servicing', amount: 2400 },
    { category: 'marketing', title: 'Instagram ads', amount: 5000 },
  ] as const;

  for (let i = 0; i < expenseDefs.length; i++) {
    const def = expenseDefs[i];
    await Expense.create({
      category: def.category,
      title: def.title,
      amount: def.amount,
      date: zonedTimeToUTC(addDays(localDateKey(), -randomInt(1, 20)), '12:00', settings.timezone),
      paymentMethod: 'cash',
      notes: 'Seed expense',
    });
  }

  // ---------- Reviews ----------
  const reviewDefs = [
    ['Aditya R.', 5, 'Best fade I have had in years. The attention to detail is unreal.'],
    ['Priyanka S.', 5, 'Loved the gold facial — my skin was glowing for days. Very hygienic salon.'],
    ['Sameer K.', 4, 'Great haircut and beard trim. Slight wait but worth it.'],
    ['Ritika M.', 5, 'The colour came out exactly like the reference photo. Highly recommend Imran.'],
    ['Nikhil B.', 5, 'Premium feel, friendly staff, easy online booking. My go-to salon now.'],
    ['Farah A.', 4, 'Lovely ambience and honest pricing. Booking reminders are handy.'],
  ] as const;

  for (const [ri, [name, rating, comment]] of reviewDefs.entries()) {
    await Review.create({ name, rating, comment, avatarUrl: IMG.avatar[ri], source: 'website', isPublished: true });
  }

  // ---------- Settings extras ----------
  settings.aboutText =
    'SalonPro is a premium unisex salon and barbershop delivering precision cuts, expert colour and relaxing spa rituals. Our master stylists use professional products and follow hospital-grade hygiene so you always leave looking and feeling your best.';
  settings.address = {
    line1: '12, Gold Arcade, MG Road',
    line2: 'Opposite Central Mall',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
    geo: { lat: 12.9756, lng: 77.6068 },
  };
  settings.phone = '+91 98765 43210';
  settings.whatsapp = '+91 98765 43210';
  settings.email = 'hello@salonpro.example';
  settings.social = {
    instagram: 'https://instagram.com/salonpro.example',
    facebook: 'https://facebook.com/salonpro.example',
    youtube: 'https://youtube.com/@salonpro.example',
  };
  settings.privacyPolicyText =
    'We collect only the information required to manage your appointments and payments. Your data is stored securely and never sold to third parties. You may request deletion of your account data at any time.';
  settings.termsText =
    'By booking an appointment you agree to arrive on time. Repeated no-shows or late cancellations may result in a booking deposit requirement or account suspension. Prices shown are inclusive of taxes unless stated otherwise.';
  settings.tagline = 'Look Sharp. Feel Great.';
  settings.heroImages = [...IMG.hero];
  settings.galleryImages = IMG.gallery.map((g) => ({ url: g.url, caption: g.caption, category: g.category }));
  await settings.save();

  logger.info({ services: services.length, customers: customers.length, appointments: created }, 'seed complete');
  console.log('\n==================== SEED COMPLETE ====================');
  console.log(` Staff/customer demo password: ${SEED_PASSWORD}`);
  console.log(` Demo barber login:   ${DEMO_PREFIX}.rahul@salonpro.local`);
  console.log(` Demo customer login: aarav.mehta@example.com`);
  console.log('=======================================================\n');

  await disconnectDB();
}

main().catch((err) => {
  logger.fatal({ err }, 'seed failed');
  process.exit(1);
});
