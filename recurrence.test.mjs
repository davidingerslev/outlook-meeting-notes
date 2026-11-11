// Dependency-free tests for the recurrence logic.
//
// recurrence.ts is TypeScript and imports type-only symbols from
// @kenjiuno/msgreader (whose runtime pulls in node builtins when bundled).
// To keep tests free of extra dependencies we transpile recurrence.ts with
// esbuild (already a devDependency), stub the type-only import, and exercise
// the result with node's built-in test runner.
//
// Run with: npm test   (i.e. `node --test`)

import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Transpile + bundle recurrence.ts, replacing the type-only msgreader import
// with inline enum constants so the bundle has no external dependencies.
const build = await esbuild.build({
	entryPoints: [join(here, 'recurrence.ts')],
	bundle: true,
	format: 'esm',
	platform: 'node',
	write: false,
	external: ['@kenjiuno/msgreader'],
	logLevel: 'silent',
});
const code = build.outputFiles[0].text.replace(
	/import\s*\{[^}]*\}\s*from\s*"@kenjiuno\/msgreader";?/s,
	'const RecurFrequency={Daily:8202,Weekly:8203,Monthly:8204,Yearly:8205};' +
		'const PatternType={Day:0,Week:1,Month:2,MonthNth:3,MonthEnd:4,HjMonth:10,HjMonthNth:11,HjMonthEnd:12};' +
		'const EndType={EndAfterDate:8225,EndAfterNOccurrences:8226,NeverEnd:8227};',
);
const bundlePath = join(here, '._recurrence.test.bundle.mjs');
writeFileSync(bundlePath, code);
const { expandOccurrences, buildChoiceList } = await import(
	'file://' + bundlePath + '?t=' + Date.now()
);
rmSync(bundlePath);

// --- helpers --------------------------------------------------------------

const RecurFrequency = { Daily: 8202, Weekly: 8203, Monthly: 8204, Yearly: 8205 };
const PatternType = { Day: 0, Week: 1, Month: 2, MonthNth: 3, MonthEnd: 4 };
const EndType = { EndAfterNOccurrences: 8226 };

const EPOCH_1601_MS = -11644473600000;
const toMin = (d) => Math.round((d.getTime() - EPOCH_1601_MS) / 60000);

function basePattern(overrides) {
	return {
		recurrencePattern: {
			calendarType: 0,
			firstDateTime: 0,
			period: 1,
			slidingFlag: 0,
			endType: EndType.EndAfterNOccurrences,
			occurrenceCount: 4,
			firstDOW: 1,
			deletedInstanceDates: [],
			modifiedInstanceDates: [],
			endDate: 0x5ae980df,
			...overrides.recurrencePattern,
		},
		startTimeOffset: 600,
		endTimeOffset: 660,
		exceptionInfo: [],
		...overrides.rest,
	};
}

const iso = (d) => d.toISOString().slice(0, 16);

// --- expandOccurrences ----------------------------------------------------

test('weekly: generates correct Mondays with time of day', () => {
	const start = new Date(2026, 0, 5); // Mon 5 Jan 2026
	const occ = expandOccurrences(
		basePattern({
			recurrencePattern: {
				recurFrequency: RecurFrequency.Weekly,
				patternType: PatternType.Week,
				patternTypeWeek: { dayOfWeekBits: 0x02 },
				startDate: toMin(start),
			},
		}),
		new Date(2026, 0, 1),
	);
	assert.equal(occ.length, 4);
	assert.deepEqual(
		occ.map((o) => o.start.getDay()),
		[1, 1, 1, 1],
	);
	// 7-day spacing
	const days = occ.map((o) => o.start.getDate());
	assert.deepEqual(days, [5, 12, 19, 26]);
	// time of day 10:00 -> 11:00
	assert.equal(occ[0].start.getHours(), 10);
	assert.equal(occ[0].end.getHours(), 11);
});

test('daily: honours a 2-day interval', () => {
	const start = new Date(2026, 1, 2);
	const occ = expandOccurrences(
		basePattern({
			recurrencePattern: {
				recurFrequency: RecurFrequency.Daily,
				patternType: PatternType.Day,
				period: 2 * 1440,
				occurrenceCount: 3,
				startDate: toMin(start),
			},
		}),
		new Date(2026, 1, 1),
	);
	assert.deepEqual(
		occ.map((o) => o.start.getDate()),
		[2, 4, 6],
	);
});

test('monthly by day-of-month', () => {
	const start = new Date(2026, 0, 15);
	const occ = expandOccurrences(
		basePattern({
			recurrencePattern: {
				recurFrequency: RecurFrequency.Monthly,
				patternType: PatternType.Month,
				patternTypeMonth: { day: 15 },
				occurrenceCount: 3,
				startDate: toMin(start),
			},
		}),
		new Date(2026, 0, 1),
	);
	assert.deepEqual(
		occ.map((o) => [o.start.getMonth(), o.start.getDate()]),
		[
			[0, 15],
			[1, 15],
			[2, 15],
		],
	);
});

test('monthly nth weekday (2nd Tuesday)', () => {
	const start = new Date(2026, 0, 1);
	const occ = expandOccurrences(
		basePattern({
			recurrencePattern: {
				recurFrequency: RecurFrequency.Monthly,
				patternType: PatternType.MonthNth,
				patternTypeMonthNth: { dayOfWeekBits: 0x04, n: 2 },
				occurrenceCount: 3,
				startDate: toMin(start),
			},
		}),
		new Date(2026, 0, 1),
	);
	// All Tuesdays, each the 2nd Tuesday of its month.
	assert.deepEqual(
		occ.map((o) => o.start.getDay()),
		[2, 2, 2],
	);
	assert.deepEqual(
		occ.map((o) => [o.start.getMonth(), o.start.getDate()]),
		[
			[0, 13],
			[1, 10],
			[2, 10],
		],
	);
});

test('deleted instances are skipped', () => {
	const start = new Date(2026, 0, 5);
	const occ = expandOccurrences(
		basePattern({
			recurrencePattern: {
				recurFrequency: RecurFrequency.Weekly,
				patternType: PatternType.Week,
				patternTypeWeek: { dayOfWeekBits: 0x02 },
				startDate: toMin(start),
				deletedInstanceDates: [toMin(new Date(2026, 0, 12))],
			},
		}),
		new Date(2026, 0, 1),
	);
	assert.deepEqual(
		occ.map((o) => o.start.getDate()),
		[5, 19, 26],
	);
});

test('exceptions move an instance to its new time', () => {
	const start = new Date(2026, 0, 5);
	const movedStart = new Date(2026, 0, 13, 14, 0); // Tue 13th 14:00
	const movedEnd = new Date(2026, 0, 13, 15, 0);
	const occ = expandOccurrences(
		basePattern({
			recurrencePattern: {
				recurFrequency: RecurFrequency.Weekly,
				patternType: PatternType.Week,
				patternTypeWeek: { dayOfWeekBits: 0x02 },
				startDate: toMin(start),
			},
			rest: {
				exceptionInfo: [
					{
						originalStartTime: toMin(new Date(2026, 0, 12)),
						startDateTime: toMin(movedStart),
						endDateTime: toMin(movedEnd),
					},
				],
			},
		}),
		new Date(2026, 0, 1),
	);
	// The 12th is replaced by the 13th 14:00.
	assert.ok(occ.some((o) => iso(o.start) === iso(movedStart)));
	assert.ok(!occ.some((o) => o.start.getDate() === 12));
});

test('infinite series is bounded by maxOccurrences', () => {
	const start = new Date(2026, 0, 5);
	const occ = expandOccurrences(
		basePattern({
			recurrencePattern: {
				recurFrequency: RecurFrequency.Weekly,
				patternType: PatternType.Week,
				patternTypeWeek: { dayOfWeekBits: 0x02 },
				occurrenceCount: 0,
				startDate: toMin(start),
			},
		}),
		new Date(2026, 0, 1),
		{ maxOccurrences: 20 },
	);
	assert.equal(occ.length, 20);
});

// --- buildChoiceList ------------------------------------------------------

const mk = (y, m, d, h) => ({ start: new Date(y, m, d, h, 0), end: new Date(y, m, d, h + 1, 0) });
const weeklyOccs = [
	mk(2026, 0, 5, 10),
	mk(2026, 0, 12, 10),
	mk(2026, 0, 19, 10),
	mk(2026, 0, 26, 10),
	mk(2026, 1, 2, 10),
	mk(2026, 1, 9, 10),
];

test('choice list: next upcoming occurrence is first and flagged', () => {
	const list = buildChoiceList(weeklyOccs, new Date(2026, 0, 20), {
		pastCount: 2,
		upcomingCount: 3,
	});
	assert.equal(list[0].isNext, true);
	assert.equal(list[0].start.getDate(), 26); // first upcoming after the 20th
	// exactly one entry is flagged isNext
	assert.equal(list.filter((c) => c.isNext).length, 1);
});

test('choice list: past instances are flagged isPast', () => {
	const list = buildChoiceList(weeklyOccs, new Date(2026, 0, 20), {
		pastCount: 2,
		upcomingCount: 3,
	});
	const past = list.filter((c) => c.isPast);
	assert.ok(past.length >= 1);
	assert.ok(past.every((c) => c.end.getTime() < new Date(2026, 0, 20).getTime()));
});

test('choice list: fully-past series pre-selects the last occurrence', () => {
	const list = buildChoiceList(weeklyOccs, new Date(2026, 5, 1));
	assert.equal(list[0].isNext, true);
	assert.equal(list[0].start.getDate(), 9); // last occurrence (Feb 9)
	assert.equal(list[0].isPast, true);
});

test('choice list: empty input yields empty list', () => {
	assert.deepEqual(buildChoiceList([], new Date()), []);
});

test('choice list: custom label formatter is used', () => {
	const list = buildChoiceList(weeklyOccs, new Date(2026, 0, 1), {
		labelFormatter: (occ, isNext) => `${isNext ? '>' : ' '}${occ.start.getDate()}`,
	});
	assert.equal(list[0].label, '>5');
});
