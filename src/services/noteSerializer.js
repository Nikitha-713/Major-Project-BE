// Two views of a note. Which one a route may use is decided by WHO is asking, not by the UI.
const { TEMPLATES } = require('../config/noteTemplates');

const labelFor = (format, key) => {
  const section = (TEMPLATES[format] ? TEMPLATES[format].sections : []).find((s) => s.key === key);
  return section ? section.label : key;
};

const sessionInfo = (s) =>
  s && s.startTime ? { id: s._id, startTime: s.startTime, serviceTitle: s.serviceTitle } : null;

// Therapist view: everything, including private notes.
function forTherapist(note) {
  return {
    id: note._id,
    clientId: note.client && note.client._id ? note.client._id : note.client,
    clientName: note.client && note.client.name ? note.client.name : undefined,
    session: sessionInfo(note.session),
    type: note.type,
    format: note.format,
    title: note.title,
    sections: note.sections.map((s) => ({ key: s.key, label: labelFor(note.format, s.key), content: s.content })),
    sharedAt: note.sharedAt || null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

// Client view: an explicit allow-list of fields, and it REFUSES anything that is not shared.
// Even if a future query forgets the 'shared' filter, a private note stops here and never leaves the server.
function forClient(note) {
  if (note.type !== 'shared') {
    throw new Error('Refusing to serialize a non-shared note for a client');
  }
  const session = sessionInfo(note.session);
  return {
    id: note._id,
    title: note.title,
    format: note.format,
    sections: note.sections.map((s) => ({ key: s.key, label: labelFor(note.format, s.key), content: s.content })),
    sharedAt: note.sharedAt,
    sessionDate: session ? session.startTime : null,
  };
}

module.exports = { forTherapist, forClient };
