'use strict';

/** URL-friendly slug: "Studio Ljepota & Stil" -> "studio-ljepota-stil" (diacritics folded, e.g. č -> c). */
function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** /salon/12-studio-one */
const salonPath = (salon) => `/salon/${salon.id}${slugify(salon.businessName) ? '-' + slugify(salon.businessName) : ''}`;

module.exports = { slugify, salonPath };
