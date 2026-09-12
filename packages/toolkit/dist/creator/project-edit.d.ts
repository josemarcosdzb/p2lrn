import { type CreatorProject } from './project-model.js';
export declare function appendChild(project: CreatorProject, parentKey: string, childKey: string): void;
export declare function addUnit(project: CreatorProject, key: string, title: string, language?: string, role?: string, parent?: string): any;
export declare function addFile(root: string, project: CreatorProject, source: string, key: string, title: string, options?: any): [any, any];
export declare function addUrl(project: CreatorProject, url: string, key: string, title: string, options?: any): [any, any];
export declare function addWebContent(root: string, project: CreatorProject, sourceDir: string, entrypoint: string, key: string, title: string, options?: any): [any, any];
export declare function addQuestionnaire(root: string, project: CreatorProject, source: string, key: string, title?: string, options?: any): [any, any];
export declare function addComponent(root: string, project: CreatorProject, source: string, key: string, title?: string, options?: any): [any, any];
export declare function addComposite(root: string, project: CreatorProject, key: string, title: string, options?: any): [any, any];
