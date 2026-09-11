import { randomBytes } from 'crypto';

const STUDENT_NUMBER_PREFIX = 'MDP-';
const STUDENT_NUMBER_RANDOM_BYTES = 10;

export function generateStudentNumber(): string {
  return `${STUDENT_NUMBER_PREFIX}${randomBytes(STUDENT_NUMBER_RANDOM_BYTES).toString('hex').toUpperCase()}`;
}
