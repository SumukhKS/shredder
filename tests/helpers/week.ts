import { addDays, mondayOf } from '../../src/lib/dates';

/** Every day of a year lands on a Monday no more than six days before it. */
export function weekBoundaryCheck() {
  for (let day = '2026-01-01'; day < '2027-01-01'; day = addDays(day, 1)) {
    const monday = mondayOf(day);
    if (monday > day || addDays(monday, 6) < day) return false;
  }
  return true;
}
