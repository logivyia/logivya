import assert from "node:assert/strict";
import { isSmartScheduleDateError, parseSmartScheduleDateTime } from "@/lib/smart-schedule-date";

const timeZone = "Europe/Istanbul";
const now = new Date("2026-07-02T09:00:00.000Z");

const cases: Array<[string, string]> = [
  ["2026-07-02 19:20", "2026-07-02T16:20:00.000Z"],
  ["2026-07-02 19.20", "2026-07-02T16:20:00.000Z"],
  ["2026.07.02 19:20", "2026-07-02T16:20:00.000Z"],
  ["2026.07.02 19.20", "2026-07-02T16:20:00.000Z"],
  ["2026/07/02 19:20", "2026-07-02T16:20:00.000Z"],
  ["2026/07/02 19.20", "2026-07-02T16:20:00.000Z"],
  ["2026 07 02 19:20", "2026-07-02T16:20:00.000Z"],
  ["02-07-2026 19:20", "2026-07-02T16:20:00.000Z"],
  ["02-07-2026 19.20", "2026-07-02T16:20:00.000Z"],
  ["02.07.2026 19:20", "2026-07-02T16:20:00.000Z"],
  ["02.07.2026 19.20", "2026-07-02T16:20:00.000Z"],
  ["02/07/2026 19:20", "2026-07-02T16:20:00.000Z"],
  ["02/07/2026 19.20", "2026-07-02T16:20:00.000Z"],
  ["2026.07.02    19:20", "2026-07-02T16:20:00.000Z"],
  ["2026-07-02      19.20", "2026-07-02T16:20:00.000Z"],
  ["02.07.2026      19:20", "2026-07-02T16:20:00.000Z"],
  ["Yarın 19:20", "2026-07-03T16:20:00.000Z"],
  ["Yarın 19.20", "2026-07-03T16:20:00.000Z"],
  ["Yarın saat 14:30", "2026-07-03T11:30:00.000Z"],
  ["Bugün 18:30", "2026-07-02T15:30:00.000Z"],
  ["Bugün 18.30", "2026-07-02T15:30:00.000Z"],
  ["Bu akşam 21:00", "2026-07-02T18:00:00.000Z"],
  ["Bu gece 23:30", "2026-07-02T20:30:00.000Z"],
  ["Öğleden sonra 15:00", "2026-07-02T12:00:00.000Z"],
  ["Akşam 20:00", "2026-07-02T17:00:00.000Z"],
  ["Gece 23:00", "2026-07-02T20:00:00.000Z"],
  ["Yarın", "2026-07-03T06:00:00.000Z"],
  ["Tomorrow 20:00", "2026-07-03T17:00:00.000Z"],
];

for (const [input, expected] of cases) {
  const result = parseSmartScheduleDateTime(input, { now, timeZone });
  assert.equal(result.iso, expected, input);
}

for (const input of ["32.15.2026 19:20", "99:80", "13/45/2026 19:20", "2026-99-99 19:20"]) {
  assert.throws(
    () => parseSmartScheduleDateTime(input, { now, timeZone }),
    (error) => isSmartScheduleDateError(error) && ["INVALID_DATE", "INVALID_TIME"].includes(error.code),
    input,
  );
}

console.log(`Smart schedule date parser passed ${cases.length} valid cases and 4 invalid cases.`);
