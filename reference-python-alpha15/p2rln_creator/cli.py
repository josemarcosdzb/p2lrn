from __future__ import annotations

import argparse
import json
import mimetypes
from pathlib import Path

from p2rln_ref.component_authoring import reference_component_catalog

from .builder import build_project
from .aulap2p_ingest import ingest_aulap2p_reader, AulaP2PIngestError
from .aulap2p_course import ingest_aulap2p_course, extract_aulap2p_course, AulaP2PCourseError
from .external import wrap as convert_external
from .project import (
    PROJECT_FILE,
    ProjectError,
    add_component,
    add_file,
    add_composite,
    add_questionnaire,
    add_unit,
    add_url,
    add_web_content,
    load_project,
    new_project,
    save_project,
)


def _project_file(root: Path) -> Path:
    return root / PROJECT_FILE


def cmd_init(args):
    root = args.directory.resolve()
    path = _project_file(root)
    if path.exists() and not args.force:
        raise ProjectError(f"project already exists: {path}; use --force to replace it")
    root.mkdir(parents=True, exist_ok=True)
    project = new_project(args.title, args.language, args.description)
    save_project(path, project)
    return {"project": str(path), "projectId": project["projectId"], "course": project["course"]["title"]}


def cmd_add_unit(args):
    path, project = load_project(args.project)
    add_unit(project, args.key, args.title, args.language, args.role, args.parent)
    save_project(path, project)
    return {"project": str(path), "addedUnit": args.key, "parent": args.parent}


def cmd_add_file(args):
    path, project = load_project(args.project)
    media = args.media_type or mimetypes.guess_type(args.file.name)[0]
    add_file(
        path.parent,
        project,
        args.file,
        args.key,
        args.title,
        language=args.language,
        parent=args.parent,
        media_type=media,
        profile=args.profile,
        role=args.role,
        activity_type=args.activity_type,
        copy_file=not args.no_copy,
    )
    save_project(path, project)
    return {"project": str(path), "addedFile": str(args.file), "key": args.key, "parent": args.parent}



def cmd_add_web_content(args):
    path, project = load_project(args.project)
    add_web_content(
        path.parent,
        project,
        args.directory,
        args.entrypoint,
        args.key,
        args.title,
        language=args.language,
        parent=args.parent,
        copy_directory=not args.no_copy,
    )
    save_project(path, project)
    return {
        "project": str(path),
        "addedWebDirectory": str(args.directory),
        "entrypoint": args.entrypoint,
        "key": args.key,
        "parent": args.parent,
    }

def cmd_add_questionnaire(args):
    path, project = load_project(args.project)
    add_questionnaire(
        path.parent,
        project,
        args.file,
        args.key,
        args.title,
        language=args.language,
        parent=args.parent,
        copy_file=not args.no_copy,
        renderer=args.renderer,
        renderer_version=args.renderer_version,
    )
    save_project(path, project)
    return {
        "project": str(path),
        "addedQuestionnaire": str(args.file),
        "key": args.key,
        "parent": args.parent,
    }


def cmd_add_component(args):
    path, project = load_project(args.project)
    _, activity = add_component(
        path.parent,
        project,
        args.file,
        args.key,
        args.title,
        language=args.language,
        parent=args.parent,
        copy_file=not args.no_copy,
    )
    save_project(path, project)
    return {
        "project": str(path),
        "addedComponent": str(args.file),
        "activity": activity["key"],
        "key": args.key,
        "parent": args.parent,
    }


def cmd_component_catalog(args):
    catalog = reference_component_catalog()
    if not args.component:
        return catalog.document
    if not args.component_version:
        matches = [item for item in catalog.list() if item["id"] == args.component]
        if not matches:
            raise ProjectError(f"component is not in reference catalog: {args.component}")
        return {"components": matches}
    if args.authoring_documents:
        return catalog.authoring_documents(args.component, args.component_version)
    definition = catalog.definition(args.component, args.component_version)
    if definition is None:
        raise ProjectError(f"component is not in reference catalog: {args.component} @ {args.component_version}")
    return definition


def cmd_validate_component_authoring(args):
    try:
        payload = json.loads(args.file.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProjectError(f"invalid component JSON: {exc}") from exc
    result = reference_component_catalog().validate_instance_data(
        payload,
        require_known=not args.allow_unknown,
    )
    return {
        "file": str(args.file),
        "known": result["known"],
        "component": payload.get("component"),
        "dataSchema": (result.get("definition") or {}).get("dataSchemas", {}).get(
            (payload.get("component") or {}).get("dataVersion")
        ),
    }


def cmd_add_composite(args):
    path, project = load_project(args.project)
    _, activity = add_composite(
        path.parent,
        project,
        args.key,
        args.title,
        language=args.language,
        parent=args.parent,
        mode=args.mode,
        completion=args.completion,
        navigation=args.navigation,
        children=args.children,
        move_children=not args.keep_existing_parents,
    )
    save_project(path, project)
    return {
        "project": str(path),
        "addedComposite": activity["key"],
        "children": list(activity.get("children", [])),
        "parent": args.parent,
    }


def cmd_add_url(args):
    path, project = load_project(args.project)
    add_url(
        project,
        args.url,
        args.key,
        args.title,
        language=args.language,
        parent=args.parent,
        media_type=args.media_type,
        profile=args.profile,
        role=args.role,
        activity_type=args.activity_type,
    )
    save_project(path, project)
    return {"project": str(path), "addedUrl": args.url, "key": args.key, "parent": args.parent}


def cmd_build(args):
    return build_project(args.project, args.output, strict_profiles=args.strict_profiles)


def cmd_convert(args):
    return convert_external(args.source, args.output, args.package_root)


def cmd_ingest_aulap2p(args):
    return ingest_aulap2p_reader(
        args.reader_json, args.output,
        source_file=args.source_file, asset_root=args.asset_root,
        language=args.language, strict_profiles=args.strict_profiles,
    )


def cmd_ingest_aulap2p_course(args):
    return ingest_aulap2p_course(
        args.course_json, args.output,
        asset_root=args.asset_root, language=args.language,
        strict_profiles=args.strict_profiles,
    )


def cmd_extract_aulap2p_course(args):
    return extract_aulap2p_course(args.package, args.output_json)


def cmd_show(args):
    path, project = load_project(args.project)
    return {
        "project": str(path),
        "projectId": project["projectId"],
        "targetFormatVersion": project["targetFormatVersion"],
        "course": project["course"],
        "counts": {
            "units": len(project["units"]),
            "resources": len(project["resources"]),
            "activities": len(project["activities"]),
            "objectives": len(project["objectives"]),
            "relations": len(project["relations"]),
        },
    }


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="p2rln-create", description="Create and package P2RLN courses")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("init", help="create an editable P2RLN project workspace")
    s.add_argument("directory", type=Path)
    s.add_argument("--title", required=True)
    s.add_argument("--language", default="es")
    s.add_argument("--description")
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=cmd_init)

    s = sub.add_parser("add-unit", help="add a module/lesson/topic unit")
    s.add_argument("project", type=Path)
    s.add_argument("--key", required=True)
    s.add_argument("--title", required=True)
    s.add_argument("--language", default="es")
    s.add_argument("--role", default="module")
    s.add_argument("--parent", default="course")
    s.set_defaults(func=cmd_add_unit)

    s = sub.add_parser("add-file", help="add a local file as Resource + Activity")
    s.add_argument("project", type=Path)
    s.add_argument("file", type=Path)
    s.add_argument("--key", required=True)
    s.add_argument("--title", required=True)
    s.add_argument("--language", default="es")
    s.add_argument("--parent", default="course")
    s.add_argument("--media-type")
    s.add_argument("--profile")
    s.add_argument("--role", default="primary")
    s.add_argument("--activity-type", default="https://p2rln.org/type/resource")
    s.add_argument("--no-copy", action="store_true", help="reference a file already inside the project instead of copying it")
    s.set_defaults(func=cmd_add_file)

    s = sub.add_parser("add-web-content", help="add a passive HTML directory while preserving relative asset paths")
    s.add_argument("project", type=Path)
    s.add_argument("directory", type=Path)
    s.add_argument("--entrypoint", default="index.html")
    s.add_argument("--key", required=True)
    s.add_argument("--title", required=True)
    s.add_argument("--language", default="es")
    s.add_argument("--parent", default="course")
    s.add_argument("--no-copy", action="store_true", help="reference a web directory already inside the project")
    s.set_defaults(func=cmd_add_web_content)

    s = sub.add_parser("add-questionnaire", help="add a validated native P2RLN questionnaire")
    s.add_argument("project", type=Path)
    s.add_argument("file", type=Path)
    s.add_argument("--key", required=True)
    s.add_argument("--title", help="override the questionnaire title")
    s.add_argument("--language", default="es")
    s.add_argument("--parent", default="course")
    s.add_argument("--no-copy", action="store_true", help="reference a questionnaire JSON already inside the project")
    s.add_argument("--renderer", help="preferred installed renderer URI; only a declarative hint is stored in the package")
    s.add_argument("--renderer-version", help="optional exact installed renderer contract version")
    s.set_defaults(func=cmd_add_questionnaire)

    s = sub.add_parser("add-component", help="add a validated declarative native P2RLN component instance")
    s.add_argument("project", type=Path)
    s.add_argument("file", type=Path)
    s.add_argument("--key", required=True)
    s.add_argument("--title", help="override the component instance title")
    s.add_argument("--language", default="es")
    s.add_argument("--parent", default="course")
    s.add_argument("--no-copy", action="store_true", help="reference a component JSON already inside the project")
    s.set_defaults(func=cmd_add_component)

    s = sub.add_parser("component-catalog", help="inspect the reference declarative component authoring catalog")
    s.add_argument("--component", help="absolute component identifier")
    s.add_argument("--component-version", help="exact component version")
    s.add_argument("--authoring-documents", action="store_true", help="include the target data/editor schema documents")
    s.set_defaults(func=cmd_component_catalog)

    s = sub.add_parser("validate-component-authoring", help="validate component data against the reference authoring catalog when known")
    s.add_argument("file", type=Path)
    s.add_argument("--allow-unknown", action="store_true", help="only apply structural validation when the component is not in the reference catalog")
    s.set_defaults(func=cmd_validate_component_authoring)

    s = sub.add_parser("add-composite", help="add a thin native composite activity that reuses child Activities")
    s.add_argument("project", type=Path)
    s.add_argument("--key", required=True)
    s.add_argument("--title", required=True)
    s.add_argument("--language", default="es")
    s.add_argument("--parent", default="course")
    s.add_argument("--mode", choices=["sequence", "free"], default="sequence")
    s.add_argument("--completion", choices=["all", "any"], default="all")
    s.add_argument("--navigation", choices=["linear", "open"])
    s.add_argument("--children", nargs="*", default=[])
    s.add_argument("--keep-existing-parents", action="store_true", help="do not reparent existing child activities out of their current hierarchy parents")
    s.set_defaults(func=cmd_add_composite)

    s = sub.add_parser("add-url", help="add a remote Resource + Activity without fetching it")
    s.add_argument("project", type=Path)
    s.add_argument("url")
    s.add_argument("--key", required=True)
    s.add_argument("--title", required=True)
    s.add_argument("--language", default="es")
    s.add_argument("--parent", default="course")
    s.add_argument("--media-type", default="text/html")
    s.add_argument("--profile")
    s.add_argument("--role", default="primary")
    s.add_argument("--activity-type", default="https://p2rln.org/type/resource")
    s.set_defaults(func=cmd_add_url)

    s = sub.add_parser("build", help="compile an editable project into a .p2rln package")
    s.add_argument("project", type=Path)
    s.add_argument("output", type=Path)
    s.add_argument("--strict-profiles", action="store_true")
    s.set_defaults(func=cmd_build)

    s = sub.add_parser("convert", help="transform an existing SCORM/H5P/QTI/cmi5/IMSCC package into P2RLN")
    s.add_argument("source", type=Path)
    s.add_argument("output", type=Path)
    s.add_argument("--package-root")
    s.set_defaults(func=cmd_convert)

    s = sub.add_parser("ingest-aulap2p", help="create P2RLN from AulaP2P Reader canonical JSON")
    s.add_argument("reader_json", type=Path)
    s.add_argument("output", type=Path)
    s.add_argument("--source-file", type=Path, help="preserve the original document bytes")
    s.add_argument("--asset-root", type=Path, help="root for materialized assets listed by the bridge envelope")
    s.add_argument("--language")
    s.add_argument("--strict-profiles", action="store_true")
    s.set_defaults(func=cmd_ingest_aulap2p)

    s = sub.add_parser("ingest-aulap2p-course", help="create P2RLN from AulaP2P aulap2p.curso.v1 or its bridge envelope")
    s.add_argument("course_json", type=Path)
    s.add_argument("output", type=Path)
    s.add_argument("--asset-root", type=Path, help="root for materialized assets/QTI packages listed by the bridge envelope")
    s.add_argument("--language", default="es")
    s.add_argument("--strict-profiles", action="store_true")
    s.set_defaults(func=cmd_ingest_aulap2p_course)

    s = sub.add_parser("extract-aulap2p-course", help="reconstruct an AulaP2P canonical course import envelope from a P2RLN package")
    s.add_argument("package", type=Path)
    s.add_argument("output_json", type=Path)
    s.set_defaults(func=cmd_extract_aulap2p_course)

    s = sub.add_parser("show", help="inspect the editable project before building")
    s.add_argument("project", type=Path)
    s.set_defaults(func=cmd_show)
    return p


def main():
    args = parser().parse_args()
    try:
        result = args.func(args)
    except (ProjectError, AulaP2PIngestError, AulaP2PCourseError, ValueError) as exc:
        raise SystemExit(f"P2RLN Creator error: {exc}") from exc
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
