// Note formats are configuration, not code: add a template here and the API and the editor pick it up.
// Every note is stored the same way, as a list of sections, so a free-form note is simply one section.
// Module 7 will gate which templates a therapist may use through the Entitlement Service.
const TEMPLATES = {
  freeform: {
    label: 'Free-form note',
    sections: [{ key: 'body', label: 'Note', hint: 'Write whatever you need.' }],
  },
  soap: {
    label: 'SOAP',
    sections: [
      { key: 'subjective', label: 'Subjective', hint: 'What the client reports: feelings, concerns, events since the last session.' },
      { key: 'objective', label: 'Objective', hint: 'What you observed: affect, behaviour, appearance, test results.' },
      { key: 'assessment', label: 'Assessment', hint: 'Your clinical impression and progress.' },
      { key: 'plan', label: 'Plan', hint: 'Interventions, homework and what happens next.' },
    ],
  },
  dap: {
    label: 'DAP',
    sections: [
      { key: 'data', label: 'Data', hint: 'Subjective and objective information from the session.' },
      { key: 'assessment', label: 'Assessment', hint: 'Your clinical impression and progress.' },
      { key: 'plan', label: 'Plan', hint: 'Interventions, homework and what happens next.' },
    ],
  },
};

const FORMAT_KEYS = Object.keys(TEMPLATES);
const list = () =>
  FORMAT_KEYS.map((key) => ({ key, label: TEMPLATES[key].label, sections: TEMPLATES[key].sections }));

module.exports = { TEMPLATES, FORMAT_KEYS, list };
