// Consent wording is versioned. A signed record stores the exact text shown at the time,
// so changing wording later never rewrites history. NOTE: this is sample text for the project;
// real practices should have their wording reviewed by a qualified professional.
const CURRENT_VERSION = 'v1-2026-10';

const templates = {
  'v1-2026-10': {
    title: 'Consent to online therapy',
    paragraphs: [
      'I agree to receive therapy from {therapistName}, including sessions held by video call, phone or chat.',
      'What I share in sessions is confidential. There are limits: my therapist may need to share information if I or someone else is at serious risk of harm, or if the law requires it.',
      'This service is not for emergencies. In a crisis I will contact my local emergency number (112 in India) or go to the nearest hospital.',
      'My intake answers and session records are stored securely. Private clinical notes written by my therapist are not shown to me in this portal.',
      'I can stop therapy at any time, and I understand that I should cancel or reschedule sessions in advance.',
    ],
  },
};

function render(version, therapistName) {
  const t = templates[version];
  if (!t) return null;
  return {
    version,
    title: t.title,
    paragraphs: t.paragraphs.map((p) => p.replace('{therapistName}', therapistName)),
  };
}

module.exports = { CURRENT_VERSION, render };
