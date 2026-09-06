import assert from 'node:assert/strict';
import { formatFreightDate } from '../src/features/freight/freight-format';
import { translate } from '../src/i18n/translations';
for (const locale of ['tr','en','ar','uz'] as const) {
  assert.equal(formatFreightDate(null,locale),translate(locale,'notSpecified'));
  assert.equal(formatFreightDate(undefined,locale),translate(locale,'notSpecified'));
  assert.equal(formatFreightDate('invalid',locale),translate(locale,'notSpecified'));
  assert.equal(formatFreightDate('2026-09-07',locale),formatFreightDate('2026-09-07T00:00:00.000Z',locale));
}
console.log('Mobile nullable date rendering: PASS');
