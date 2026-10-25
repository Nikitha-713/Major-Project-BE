const Therapist = require('../models/Therapist');
const { SLUG_REGEX, isReserved } = require('../utils/generateSlug');

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only these fields can be edited from the profile screen.
const EDITABLE_FIELDS = ['name', 'headline', 'bio', 'services'];

const cleanList = (list) =>
  [...new Set((list || []).map((item) => String(item).trim()).filter(Boolean))].slice(0, 15);

exports.updateMe = async (req, res, next) => {
  try {
    const therapist = req.therapist;

    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) therapist[field] = req.body[field];
    }
    if (req.body.specializations) therapist.specializations = cleanList(req.body.specializations);
    if (req.body.languages) therapist.languages = cleanList(req.body.languages);

    if (req.body.slug !== undefined) {
      const slug = String(req.body.slug).trim().toLowerCase();
      if (!SLUG_REGEX.test(slug) || isReserved(slug)) {
        return res.status(400).json({ message: 'That link is not allowed. Use letters, numbers and hyphens.' });
      }
      const taken = await Therapist.exists({ slug, _id: { $ne: therapist._id } });
      if (taken) return res.status(409).json({ message: 'That link is already taken' });
      therapist.slug = slug;
    }

    await therapist.save();
    res.json({ therapist: therapist.toOwnerJSON() });
  } catch (err) {
    next(err);
  }
};

// Public: anyone with the link. Goes through toPublicProfile() so no private fields leak.
exports.getPublicProfile = async (req, res, next) => {
  try {
    const therapist = await Therapist.findOne({ slug: req.params.slug.toLowerCase() });
    if (!therapist) return res.status(404).json({ message: 'Profile not found' });
    res.json({ therapist: therapist.toPublicProfile() });
  } catch (err) {
    next(err);
  }
};

// Share endpoint: serves Open Graph tags to link-preview bots (WhatsApp, LinkedIn, Slack),
// then sends real visitors on to the React profile page. Bots do not run React, so tags
// set client-side would be invisible to them.
exports.getShareHtml = async (req, res, next) => {
  try {
    const therapist = await Therapist.findOne({ slug: req.params.slug.toLowerCase() });
    if (!therapist) return res.status(404).send('Profile not found');

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const target = `${clientUrl}/${therapist.slug}`;
    const title = `${therapist.name} | Book a session`;
    const description =
      therapist.headline || (therapist.bio || '').slice(0, 160) || `Book a therapy session with ${therapist.name}.`;

    res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:type" content="profile" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(target)}" />
<meta name="twitter:card" content="summary" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}" />
</head><body><a href="${escapeHtml(target)}">Continue to ${escapeHtml(therapist.name)}'s page</a></body></html>`);
  } catch (err) {
    next(err);
  }
};
