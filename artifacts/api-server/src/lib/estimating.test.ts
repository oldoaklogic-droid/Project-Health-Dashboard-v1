import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateEstimate } from './estimating.js';

const intake = {
  drivers: { lots: 3, acreage: 2 },
  stepFlags: {},
};

test('calculates one estimate per canonical discipline and sums fees', () => {
  const result = calculateEstimate({ ...intake, disciplines: ['Short Plat', 'topo'] });

  assert.ok(result);
  assert.deepEqual(result.disciplines.map((estimate) => estimate.discipline), [
    'Short Plat',
    'Topographic Survey',
  ]);
  assert.equal(result.rate, 220);
  assert.equal(
    result.totalHours,
    Math.ceil((result.disciplines[0].totalHours + result.disciplines[1].totalHours - Number.EPSILON) * 2) / 2,
  );
  assert.equal(result.totalFee, result.disciplines[0].fee + result.disciplines[1].fee);
  assert.equal(result.disciplines[0].fee, result.disciplines[0].totalHours * 220);
});

test('marks disciplines without a template as pending with zero estimates', () => {
  const result = calculateEstimate({ ...intake, projectType: 'Planning' });

  assert.ok(result);
  assert.deepEqual(result.disciplines[0], {
    discipline: 'Planning',
    disciplineKey: null,
    activities: [],
    phases: [],
    totalHours: 0,
    hasPendingHistory: false,
    fee: 0,
    templatePending: true,
  });
  assert.equal(result.totalFee, 0);
});

test('retains source engine step handling and accepts canonical keys', () => {
  const result = calculateEstimate({
    ...intake,
    projectType: 'civil',
    rate: 175,
    stepFlags: { water: true },
  });

  assert.ok(result);
  const civil = result.disciplines[0];
  assert.equal(civil.discipline, 'Civil Engineering');
  assert.equal(civil.templatePending, false);
  assert.ok(civil.activities.some((activity) => activity.code === 'C-600'));
  assert.equal(civil.fee, civil.totalHours * 175);
});