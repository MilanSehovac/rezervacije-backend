const { Op } = require('sequelize');
const { Salon, Review, Booking, SalonService, User } = require('../models');
const { salonPath } = require('../services/slug');

const siteUrl = () => (process.env.PUBLIC_SITE_URL || process.env.CLIENT_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');

// GET /api/stats -> real numbers for the landing page
exports.stats = async (req, res) => {
  try {
    const [salons, cities, completedBookings, reviews] = await Promise.all([
      Salon.count({ where: { isApproved: true } }),
      Salon.count({ where: { isApproved: true, city: { [Op.ne]: null } }, distinct: true, col: 'city' }),
      Booking.count({ where: { status: 'completed' } }),
      Review.count(),
    ]);
    res.json({ salons, cities, completedBookings, reviews });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
};

// GET /api/reviews/recent -> latest good reviews that have text
exports.recentReviews = async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { rating: { [Op.gte]: 4 }, comment: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
      include: [
        { model: Salon, attributes: ['id', 'businessName'], where: { isApproved: true } },
        { model: User, as: 'customer', attributes: ['firstName', 'lastName'], required: false },
        { model: Booking, attributes: ['id'], include: [{ model: SalonService, as: 'service', attributes: ['name'] }] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 3,
    });
    res.json(
      reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        author: r.customer ? `${r.customer.firstName} ${(r.customer.lastName || '').charAt(0)}.`.trim() : 'Customer',
        salonId: r.Salon.id,
        salonName: r.Salon.businessName,
        service: r.Booking && r.Booking.service ? r.Booking.service.name : null,
      }))
    );
  } catch (error) {
    console.error('Error getting recent reviews:', error);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
};

// GET /robots.txt
exports.robots = (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /profile',
      'Disallow: /admin',
      'Disallow: /salon/dashboard',
      'Disallow: /salon/create',
      '',
      `Sitemap: ${siteUrl()}/sitemap.xml`,
      '',
    ].join('\n')
  );
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// GET /sitemap.xml
exports.sitemap = async (req, res) => {
  try {
    const base = siteUrl();
    const salons = await Salon.findAll({ where: { isApproved: true }, attributes: ['id', 'businessName', 'updatedAt'] });
    const urls = [
      { loc: `${base}/`, priority: '1.0' },
      { loc: `${base}/search`, priority: '0.9' },
      { loc: `${base}/services`, priority: '0.7' },
      ...salons.map((s) => ({ loc: `${base}${salonPath(s)}`, lastmod: new Date(s.updatedAt).toISOString(), priority: '0.8' })),
    ];
    const body = urls
      .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
      .join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  } catch (error) {
    console.error('Error building sitemap:', error);
    res.status(500).type('text/plain').send('Failed to build sitemap');
  }
};

exports.siteUrl = siteUrl;
