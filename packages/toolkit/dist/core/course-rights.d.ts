export declare const COURSE_RIGHTS_EXTENSION = "https://p2lrn.org/ext/course-rights/1";
export interface CourseRights {
    author?: string;
    createdAt?: string;
    license?: string;
    copyrightHolder?: string;
}
export type CourseRightsChanges = {
    author?: string | null;
    createdAt?: string | null;
    license?: string | null;
    copyrightHolder?: string | null;
};
export declare const COURSE_RIGHTS_SCHEMA: {
    $id: string;
    type: string;
    minProperties: number;
    additionalProperties: boolean;
    properties: {
        author: {
            type: string;
            minLength: number;
            maxLength: number;
        };
        createdAt: {
            type: string;
            pattern: string;
        };
        license: {
            type: string;
            minLength: number;
            maxLength: number;
        };
        copyrightHolder: {
            type: string;
            minLength: number;
            maxLength: number;
        };
    };
};
export declare function validateCourseRights(value: unknown): CourseRights;
export declare function applyCourseRights(course: Record<string, any>, changes: CourseRightsChanges): CourseRights;
export declare function newCourseCreationDate(): string;
