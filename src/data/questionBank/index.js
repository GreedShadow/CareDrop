import { fundamentals } from './fundamentals.js';
import { pharmacology } from './pharmacology.js';
import { medicalSurgical } from './medicalSurgical.js';
import { maternalNewborn } from './maternalNewborn.js';
import { pediatrics } from './pediatrics.js';
import { psychiatricNursing } from './psychiatricNursing.js';
import { communityHealth } from './communityHealth.js';
import { leadershipManagement } from './leadershipManagement.js';

export { BANK_ITEMS_PER_BUCKET, BUCKET_DIFFICULTIES, QUESTION_LEAD_INS, QUESTION_TEMPLATES, ANSWER_REMINDERS, FLASHCARD_RATING_POINTS, SLOW_RESPONSE_THRESHOLDS_MS } from './shared.js';

export const SEED_QUESTION_BANK = {
  Fundamentals: fundamentals,
  Pharmacology: pharmacology,
  'Medical-Surgical': medicalSurgical,
  'Maternal & Newborn': maternalNewborn,
  Pediatrics: pediatrics,
  'Psychiatric Nursing': psychiatricNursing,
  'Community Health': communityHealth,
  'Leadership & Management': leadershipManagement,
};
