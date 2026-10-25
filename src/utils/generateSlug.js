// Slugs become public URLs (/:slug), so they must never collide with app routes.
const RESERVED_SLUGS = [
  'login', 'register', 'dashboard', 'api', 'admin', 'book', 'pay', 'portal',
  'clients', 'schedule', 'notes', 'analytics', 'settings', 'health', 'static', 'assets',
];

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function isReserved(slug) {
  return RESERVED_SLUGS.includes(slug);
}

// Generates a unique slug from a name: "Dr. Asha Rao" -> "dr-asha-rao", then "dr-asha-rao-2", ...
async function generateUniqueSlug(Model, name) {
  let base = slugify(name) || 'therapist';
  if (isReserved(base)) base = `${base}-therapy`;

  let slug = base;
  let counter = 1;
  while (await Model.exists({ slug })) {
    counter += 1;
    slug = `${base}-${counter}`;
  }
  return slug;
}

module.exports = { generateUniqueSlug, slugify, isReserved, SLUG_REGEX, RESERVED_SLUGS };
