// Obsidian-independent recurrence expansion logic.
//
// Microsoft stores recurrence dates as "minutes since midnight, 1 Jan 1601"
// (see [MS-OXOCAL]). This module turns a parsed AppointmentRecur structure
// (as produced by @kenjiuno/msgreader) into a concrete list of occurrences.
//
// Keeping this free of any Obsidian imports means it can be unit-tested
// without the Obsidian runtime.

import {
	AppointmentRecur,
	RecurrencePattern,
	RecurFrequency,
	PatternType,
	EndType,
} from '@kenjiuno/msgreader';

/** Milliseconds between the Unix epoch and 1 Jan 1601 (negative => 1601 is earlier). */
export const EPOCH_1601_MS = -11644473600000;

/** Minutes per day, used by the daily-recurrence period encoding. */
const MINUTES_PER_DAY = 1440;

/**
 * Convert a value expressed as "minutes since midnight, 1 Jan 1601" into a
 * JavaScript Date.
 *
 * The MS-OXOCAL recurrence dates are expressed in the recurrence's local time
 * zone. For v1 we treat them as local time of the current machine; the time
 * zone subtleties are documented as a known limitation in PLAN.md.
 */
export function minutesToDate(minutes: number): Date {
	return new Date(EPOCH_1601_MS + minutes * 60000);
}

/** A single concrete occurrence of a recurring appointment. */
export interface Occurrence {
	start: Date;
	end: Date;
}

// Day-of-week bit masks as defined by PatternTypeWeek / PatternTypeMonthNth.
const DOW_BITS: number[] = [
	0x01, // Sunday
	0x02, // Monday
	0x04, // Tuesday
	0x08, // Wednesday
	0x10, // Thursday
	0x20, // Friday
	0x40, // Saturday
];

/** "Never end" sentinel for the recurrence end date (0x5AE980DF). */
const NEVER_END_DATE = 0x5ae980df;

/**
 * Safety cap on how many occurrences we ever generate, so that infinite or
 * very long series (and any logic error) cannot produce an unbounded loop.
 */
const MAX_OCCURRENCES = 1000;

interface ExpandOptions {
	/**
	 * Hard cap on the number of generated occurrences. Defaults to
	 * {@link MAX_OCCURRENCES}. Used to bound infinite series.
	 */
	maxOccurrences?: number;
}

/**
 * Expand an AppointmentRecur into a chronological list of occurrences.
 *
 * Deleted instances are skipped and modified instances (exceptions) are moved
 * to their new start/end. The time of day comes from startTimeOffset /
 * endTimeOffset. Generation stops at endDate / occurrenceCount / endType, and
 * is always bounded by {@link ExpandOptions.maxOccurrences}.
 *
 * @param apptRecur Parsed recurrence structure from msgreader.
 * @param _now Reference "now" (reserved for future windowing; expansion itself
 *             is independent of it).
 */
export function expandOccurrences(
	apptRecur: AppointmentRecur,
	_now: Date = new Date(),
	options: ExpandOptions = {},
): Occurrence[] {
	const pattern = apptRecur.recurrencePattern;
	if (!pattern) {
		return [];
	}

	const maxOccurrences = options.maxOccurrences ?? MAX_OCCURRENCES;

	const startTimeOffset = apptRecur.startTimeOffset ?? 0;
	const endTimeOffset = apptRecur.endTimeOffset ?? startTimeOffset;
	// Duration of a single occurrence in minutes. endTimeOffset can be smaller
	// than startTimeOffset for appointments that cross midnight; add a day.
	let durationMinutes = endTimeOffset - startTimeOffset;
	if (durationMinutes < 0) {
		durationMinutes += MINUTES_PER_DAY;
	}

	const deleted = toDateKeySet(pattern.deletedInstanceDates);
	const exceptions = buildExceptionMap(apptRecur);

	const startDates = generateStartDates(pattern, maxOccurrences);

	const occurrences: Occurrence[] = [];
	for (const dayDate of startDates) {
		const dayKey = dateKey(dayDate);

		// Exceptions: a modified instance replaces the generated one.
		const exception = exceptions.get(dayKey);
		if (exception) {
			occurrences.push(exception);
			continue;
		}

		// Deleted instances are removed from the series entirely.
		if (deleted.has(dayKey)) {
			continue;
		}

		const start = addMinutes(dayDate, startTimeOffset);
		const end = addMinutes(start, durationMinutes);
		occurrences.push({ start, end });
	}

	occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
	return occurrences;
}

/**
 * Generate the per-day start Dates (midnight, local) for every occurrence in
 * the series, before applying time-of-day, deletions and exceptions.
 */
function generateStartDates(pattern: RecurrencePattern, maxOccurrences: number): Date[] {
	const seriesStart = minutesToDate(pattern.startDate);
	const hasEndDate =
		pattern.endType === EndType.EndAfterDate ||
		pattern.endType === EndType.EndAfterNOccurrences;
	const seriesEnd =
		hasEndDate && pattern.endDate !== NEVER_END_DATE
			? minutesToDate(pattern.endDate)
			: null;

	const occurrenceCountLimit =
		pattern.endType === EndType.EndAfterNOccurrences && pattern.occurrenceCount > 0
			? pattern.occurrenceCount
			: Infinity;

	const limit = Math.min(maxOccurrences, occurrenceCountLimit);

	switch (pattern.recurFrequency) {
		case RecurFrequency.Daily:
			return generateDaily(pattern, seriesStart, seriesEnd, limit);
		case RecurFrequency.Weekly:
			return generateWeekly(pattern, seriesStart, seriesEnd, limit);
		case RecurFrequency.Monthly:
		case RecurFrequency.Yearly:
			return generateMonthly(pattern, seriesStart, seriesEnd, limit);
		default:
			// Unknown frequency: fall back to the single series start date.
			return [atMidnight(seriesStart)];
	}
}

function generateDaily(
	pattern: RecurrencePattern,
	seriesStart: Date,
	seriesEnd: Date | null,
	limit: number,
): Date[] {
	// For daily recurrence, period is stored as minutes in a whole number of days.
	const stepDays = Math.max(1, Math.round(pattern.period / MINUTES_PER_DAY));
	const dates: Date[] = [];
	let current = atMidnight(seriesStart);
	while (dates.length < limit && withinEnd(current, seriesEnd)) {
		dates.push(new Date(current));
		current = addDays(current, stepDays);
	}
	return dates;
}

function generateWeekly(
	pattern: RecurrencePattern,
	seriesStart: Date,
	seriesEnd: Date | null,
	limit: number,
): Date[] {
	const stepWeeks = Math.max(1, pattern.period);
	const dowBits = pattern.patternTypeWeek?.dayOfWeekBits ?? 0;
	// Which weekdays (0=Sun..6=Sat) the event occurs on.
	let activeDays = DOW_BITS.map((bit, idx) => ({ bit, idx }))
		.filter(({ bit }) => (dowBits & bit) !== 0)
		.map(({ idx }) => idx);
	if (activeDays.length === 0) {
		// No weekday bits: fall back to the weekday of the series start.
		activeDays = [atMidnight(seriesStart).getDay()];
	}

	const dates: Date[] = [];
	// Anchor to the start of the week containing the series start.
	const firstDow = pattern.firstDOW ?? 0;
	let weekStart = startOfWeek(atMidnight(seriesStart), firstDow);
	const seriesStartMidnight = atMidnight(seriesStart);

	while (dates.length < limit) {
		let producedInWeek = false;
		for (let offset = 0; offset < 7; offset++) {
			const day = addDays(weekStart, offset);
			if (!activeDays.includes(day.getDay())) {
				continue;
			}
			if (day.getTime() < seriesStartMidnight.getTime()) {
				continue;
			}
			if (!withinEnd(day, seriesEnd)) {
				return dates;
			}
			dates.push(new Date(day));
			producedInWeek = true;
			if (dates.length >= limit) {
				return dates;
			}
		}
		// Guard against pathological cases where nothing is ever produced.
		if (!producedInWeek && weekStart.getTime() > seriesStartMidnight.getTime() + 7 * 86400000) {
			break;
		}
		weekStart = addDays(weekStart, 7 * stepWeeks);
	}
	return dates;
}

function generateMonthly(
	pattern: RecurrencePattern,
	seriesStart: Date,
	seriesEnd: Date | null,
	limit: number,
): Date[] {
	// Monthly: period in months. Yearly: period MUST be 12.
	const stepMonths = Math.max(1, pattern.period);
	const dates: Date[] = [];
	const start = atMidnight(seriesStart);

	let year = start.getFullYear();
	let month = start.getMonth();
	let guard = 0;
	while (dates.length < limit && guard < limit * 12 + 24) {
		guard++;
		const day = resolveMonthlyDay(pattern, year, month);
		if (day) {
			if (day.getTime() >= start.getTime()) {
				if (!withinEnd(day, seriesEnd)) {
					break;
				}
				dates.push(day);
			}
		}
		month += stepMonths;
		year += Math.floor(month / 12);
		month = month % 12;
	}
	return dates;
}

/**
 * Resolve the concrete day in a given month for a monthly/yearly pattern.
 * Handles both "day N of the month" and "nth weekday of the month".
 */
function resolveMonthlyDay(
	pattern: RecurrencePattern,
	year: number,
	month: number,
): Date | null {
	if (
		pattern.patternType === PatternType.MonthNth ||
		pattern.patternType === PatternType.HjMonthNth
	) {
		const nth = pattern.patternTypeMonthNth;
		if (!nth) {
			return null;
		}
		const weekdays = DOW_BITS.map((bit, idx) => ({ bit, idx }))
			.filter(({ bit }) => (nth.dayOfWeekBits & bit) !== 0)
			.map(({ idx }) => idx);
		if (weekdays.length === 0) {
			return null;
		}
		return nthWeekdayOfMonth(year, month, weekdays, nth.n);
	}

	// Day-of-month patterns (Month / MonthEnd and Hijri equivalents).
	const dayOfMonth = pattern.patternTypeMonth?.day ?? 1;
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const clampedDay = Math.min(dayOfMonth, daysInMonth);
	return new Date(year, month, clampedDay, 0, 0, 0, 0);
}

/**
 * Find the nth occurrence (1..5, where 5 means "last") of any of the given
 * weekdays within a month.
 */
function nthWeekdayOfMonth(
	year: number,
	month: number,
	weekdays: number[],
	n: number,
): Date | null {
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const matching: number[] = [];
	for (let d = 1; d <= daysInMonth; d++) {
		const date = new Date(year, month, d);
		if (weekdays.includes(date.getDay())) {
			matching.push(d);
		}
	}
	if (matching.length === 0) {
		return null;
	}
	// n: 1..4 => specific occurrence; 5 => last occurrence.
	const index = n >= 5 ? matching.length - 1 : Math.min(n, matching.length) - 1;
	return new Date(year, month, matching[index], 0, 0, 0, 0);
}

/** Build a map from the original instance day-key to its modified occurrence. */
function buildExceptionMap(apptRecur: AppointmentRecur): Map<string, Occurrence> {
	const map = new Map<string, Occurrence>();
	const infos = apptRecur.exceptionInfo ?? [];
	for (const info of infos) {
		if (
			typeof info.originalStartTime !== 'number' ||
			typeof info.startDateTime !== 'number' ||
			typeof info.endDateTime !== 'number'
		) {
			continue;
		}
		const originalDay = dateKey(atMidnight(minutesToDate(info.originalStartTime)));
		map.set(originalDay, {
			start: minutesToDate(info.startDateTime),
			end: minutesToDate(info.endDateTime),
		});
	}
	return map;
}

/** Set of day-keys for deleted instance dates. */
function toDateKeySet(minutesList: number[] | undefined): Set<string> {
	const set = new Set<string>();
	for (const m of minutesList ?? []) {
		set.add(dateKey(atMidnight(minutesToDate(m))));
	}
	return set;
}

// --- small date helpers (local-time based) ---

function atMidnight(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.getTime() + minutes * 60000);
}

function startOfWeek(date: Date, firstDow: number): Date {
	const d = atMidnight(date);
	const diff = (d.getDay() - firstDow + 7) % 7;
	return addDays(d, -diff);
}

function withinEnd(date: Date, seriesEnd: Date | null): boolean {
	if (!seriesEnd) {
		return true;
	}
	return date.getTime() <= seriesEnd.getTime();
}

/** Stable per-day key (local date) used for matching deletions/exceptions. */
function dateKey(date: Date): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, '0');
	const d = `${date.getDate()}`.padStart(2, '0');
	return `${y}-${m}-${d}`;
}
