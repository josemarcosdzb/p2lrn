import { ValidationError } from './errors.js';
import { validateSchema } from './json-schema.js';
export const COURSE_RIGHTS_EXTENSION = 'https://p2lrn.org/ext/course-rights/1';
const FIELD_LIMITS = { author: 300, createdAt: 10, license: 2000, copyrightHolder: 300 };
export const COURSE_RIGHTS_SCHEMA = {
    $id: 'https://p2lrn.org/schema/course-rights/1',
    type: 'object', minProperties: 1, additionalProperties: false,
    properties: {
        author: { type: 'string', minLength: 1, maxLength: 300 },
        createdAt: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$' },
        license: { type: 'string', minLength: 1, maxLength: 2000 },
        copyrightHolder: { type: 'string', minLength: 1, maxLength: 300 }
    }
};
function checkDate(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value))
        throw new ValidationError('createdAt must be a valid YYYY-MM-DD calendar date');
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        throw new ValidationError('createdAt must be a real calendar date');
}
export function validateCourseRights(value) {
    validateSchema(COURSE_RIGHTS_SCHEMA, value, 'course rights');
    const rights = value;
    if (rights.createdAt)
        checkDate(rights.createdAt);
    for (const [field, limit] of Object.entries(FIELD_LIMITS))
        if (typeof rights[field] === 'string' &&
            (rights[field] !== rights[field].trim() ||
                rights[field].length > limit))
            throw new ValidationError('Invalid course rights value for ' + field);
    return rights;
}
export function applyCourseRights(course, changes) {
    if (!course || typeof course !== 'object')
        throw new ValidationError('Course is required');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes))
        throw new ValidationError('Course rights changes must be an object');
    const previous = course.extensions?.[COURSE_RIGHTS_EXTENSION] ?? {};
    if (previous && Object.keys(previous).length)
        validateCourseRights(previous);
    const next = { ...previous };
    for (const [field, raw] of Object.entries(changes)) {
        if (!(field in FIELD_LIMITS))
            throw new ValidationError('Unsupported course rights field: ' + field);
        if (raw === null || raw === '')
            delete next[field];
        else if (typeof raw === 'string')
            next[field] = raw.trim();
        else
            throw new ValidationError('Course rights must be text or null: ' + field);
    }
    if (Object.keys(next).length)
        validateCourseRights(next);
    if (Object.keys(next).length) {
        course.extensions ??= {};
        course.extensions[COURSE_RIGHTS_EXTENSION] = next;
    }
    else if (course.extensions) {
        delete course.extensions[COURSE_RIGHTS_EXTENSION];
        if (!Object.keys(course.extensions).length)
            delete course.extensions;
    }
    return next;
}
export function newCourseCreationDate() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
//# sourceMappingURL=course-rights.js.map