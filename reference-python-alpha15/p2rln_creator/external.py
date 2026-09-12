#!/usr/bin/env python3
"""Reference external-learning-package -> P2RLN Core 0.4.0 transformer.

The tool preserves an original package as one content-addressed payload and projects
portable structure into graph.json where the source format provides enough metadata.
It does not claim to replace the source standard's runtime semantics.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import io
import json
import mimetypes
from pathlib import Path, PurePosixPath
import re
import uuid
import zipfile
from xml.etree import ElementTree as ET

from p2rln_ref import validator as v

NS = uuid.UUID("12d4c8f7-1b78-4bf2-9f7c-a2d215f8d8f5")
URI_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")

PROFILE = {
    "h5p": "https://p2rln.org/profile/h5p",
    "scorm": "https://p2rln.org/profile/scorm",
    "cmi5": "https://p2rln.org/profile/cmi5",
    "common-cartridge": "https://p2rln.org/profile/common-cartridge",
    "tincan-package": "https://p2rln.org/profile/tincan-package",
    "web-content": "https://p2rln.org/profile/web-content",
    "qti": "https://p2rln.org/profile/qti",
    "lti": "https://p2rln.org/profile/lti",
}


def local(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def text_content(el) -> str:
    if el is None:
        return ""
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def first_direct(el, name: str):
    for ch in list(el):
        if local(ch.tag) == name:
            return ch
    return None


def langmap(container, fallback="und") -> dict[str, str]:
    if container is None:
        return {}
    result = {}
    for el in container.iter():
        if local(el.tag).lower() == "langstring":
            value = text_content(el)
            if value:
                lang = el.attrib.get("lang") or el.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") or fallback
                result[lang] = value
    if result:
        return result
    value = text_content(container)
    return {fallback: value} if value else {}


def title_map(value: str, lang="und") -> dict[str, str]:
    value = re.sub(r"\s+", " ", value or "").strip()
    return {lang: value or "Untitled"}


def stable_urn(seed: str, kind: str, key: str) -> str:
    return "urn:uuid:" + str(uuid.uuid5(NS, f"{seed}|{kind}|{key}"))


def portable_id(seed: str, kind: str, source: str | None) -> str:
    source = (source or "").strip()
    if source and URI_RE.match(source):
        return source
    return stable_urn(seed, kind, source or kind)


def validate_source_zip(zf: zipfile.ZipFile):
    infos = zf.infolist()
    if len(infos) > 20000:
        raise ValueError("source archive has more than 20000 entries")
    seen = set()
    for info in infos:
        name = info.filename.rstrip("/")
        if not name:
            continue
        v.safe_zip_name(name)
        if info.filename in seen:
            raise ValueError(f"duplicate source ZIP entry: {info.filename}")
        seen.add(info.filename)
        if info.flag_bits & 0x1:
            raise ValueError(f"encrypted source ZIP entry: {info.filename}")
        if info.file_size > 0 and info.compress_size > 0 and info.file_size / info.compress_size > 500:
            raise ValueError(f"source ZIP compression ratio exceeds 500: {info.filename}")


def normalized_subpackage(zf: zipfile.ZipFile, root: str) -> tuple[bytes, dict[str, bytes]]:
    prefix = root.strip("/") + "/"
    selected = {}
    for info in zf.infolist():
        if info.is_dir() or not info.filename.startswith(prefix):
            continue
        rel = info.filename[len(prefix):]
        if not rel:
            continue
        v.safe_zip_name(rel)
        selected[rel] = zf.read(info.filename)
    if not selected:
        raise ValueError(f"package root not found or empty: {root}")
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as out:
        for name, data in sorted(selected.items()):
            zi = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o100644 << 16
            out.writestr(zi, data)
    return bio.getvalue(), selected


def load_source(path: Path, package_root: str | None):
    original = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(original)) as zf:
        validate_source_zip(zf)
        if package_root:
            package_bytes, files = normalized_subpackage(zf, package_root)
            return original, package_bytes, files, package_root.strip("/")
        files = {i.filename: zf.read(i.filename) for i in zf.infolist() if not i.is_dir()}
        return original, original, files, None


def detect(files: dict[str, bytes]):
    names = set(files)
    if "h5p.json" in names:
        return "h5p"
    if "cmi5.xml" in names:
        return "cmi5"
    if "tincan.xml" in names:
        return "tincan-package"
    if "imsmanifest.xml" in names:
        root = ET.fromstring(files["imsmanifest.xml"])
        schema = ""
        schemaversion = ""
        for el in root.iter():
            if local(el.tag) == "schema" and el.text:
                schema = el.text.strip()
            if local(el.tag) == "schemaversion" and el.text:
                schemaversion = el.text.strip()
        ns = root.tag[1:].split("}", 1)[0] if root.tag.startswith("{") else ""
        # QTI 3 packaging uses its own IMS Content Packaging namespace and
        # normally declares schema="QTI Package". Detect it before Common
        # Cartridge/SCORM because the same imsmanifest.xml filename is shared.
        if "QTI Package" in schema or "qti/qtiv3p0" in ns or "imsqtiasi_v3p0" in ns:
            return "qti"
        if "Common Cartridge" in schema or "imscc" in ns:
            return "common-cartridge"
        has_scorm_attr = any(local(k).lower() == "scormtype" for el in root.iter() for k in el.attrib)
        if "SCORM" in schema or has_scorm_attr or "adlcp_rootv1p2.xsd" in names:
            return "scorm"
    raise ValueError("unsupported or unrecognized package format")


def package_path(data: bytes) -> tuple[str, str]:
    hexv = hashlib.sha256(data).hexdigest()
    return f"packages/sha256/{hexv[:2]}/{hexv[2:4]}/{hexv}", "sha256:" + hexv


def desc_for_payload(path: str, data: bytes, media="application/zip"):
    digest = v.sha256(data)
    return {"path": path, "mediaType": media, "size": len(data), "byteDigest": digest, "contentDigest": digest}


def rep(seed, profile, ppath, original_name, metadata, key):
    return {
        "id": stable_urn(seed, "representation", key),
        "role": "original-package",
        "mediaType": "application/zip",
        "profile": profile,
        "originalName": original_name,
        "location": {"type": "embedded", "path": ppath},
        "extensions": {profile: metadata},
    }


def member_rep(seed, profile, ppath, member, metadata, key, *, role="rendered", media_type=None):
    media_type = media_type or mimetypes.guess_type(member)[0] or "application/octet-stream"
    return {
        "id": stable_urn(seed, "representation", key),
        "role": role,
        "mediaType": media_type,
        "profile": profile,
        "location": {"type": "package-member", "package": ppath, "member": member},
        "extensions": {profile: metadata},
    }


def first_resource_file(src):
    if src is None:
        return None
    for el in src.iter():
        if local(el.tag) == "file" and el.attrib.get("href"):
            return el.attrib["href"]
    return None


def basic_lti_metadata(files, src):
    member = first_resource_file(src)
    if not member or member not in files:
        return None
    try:
        root = ET.fromstring(files[member])
    except ET.ParseError:
        return None
    def first_text(name):
        for el in root.iter():
            if local(el.tag) == name:
                value = text_content(el)
                if value:
                    return value
        return None
    launch = first_text("secure_launch_url") or first_text("launch_url")
    return {
        "sourceStandard": "IMS Basic LTI",
        "sourceVersion": "1.0",
        "descriptorMember": member,
        "title": first_text("title"),
        "description": first_text("description"),
        "launchUrl": launch,
        "targetLinkUri": launch,
        "rebindRequired": True,
        "migrationTarget": "LTI 1.3",
    }




def cc_web_link_metadata(files, src):
    member=first_resource_file(src)
    if not member or member not in files:
        return None
    try:
        root=ET.fromstring(files[member])
    except ET.ParseError:
        return None
    title=""; href=""
    for el in root.iter():
        ln=local(el.tag)
        if ln=="title" and not title:
            title=text_content(el)
        elif ln=="url" and not href:
            href=el.attrib.get("href") or text_content(el)
    if not href:
        return None
    return {"descriptorMember":member,"title":title or None,"href":href,"sourceStandard":"IMS Common Cartridge Web Link"}


def cc_discussion_metadata(files, src):
    member=first_resource_file(src)
    if not member or member not in files:
        return None
    try:
        root=ET.fromstring(files[member])
    except ET.ParseError:
        return None
    title=""; body=""; text_type=""
    for el in root.iter():
        ln=local(el.tag)
        if ln=="title" and not title:
            title=text_content(el)
        elif ln=="text" and not body:
            body=text_content(el)
            text_type=el.attrib.get("texttype") or ""
    return {k:v for k,v in {"descriptorMember":member,"title":title,"text":body,"textType":text_type,"sourceStandard":"IMS Common Cartridge Discussion Topic"}.items() if v}

def ims_manifest_info(data: bytes, names: set[str]):
    root = ET.fromstring(data)
    schema = ""; schemaversion = ""
    for el in root.iter():
        if local(el.tag) == "schema" and el.text: schema = el.text.strip()
        if local(el.tag) == "schemaversion" and el.text: schemaversion = el.text.strip()
    orgs = next((el for el in root.iter() if local(el.tag) == "organizations"), None)
    default_org = orgs.attrib.get("default") if orgs is not None else None
    org_list = [el for el in list(orgs) if local(el.tag) == "organization"] if orgs is not None else []
    org = next((o for o in org_list if o.attrib.get("identifier") == default_org), None)
    if org is None and org_list:
        org = org_list[0]
    resources = {el.attrib.get("identifier"): el for el in root.iter() if local(el.tag) == "resource" and el.attrib.get("identifier")}
    version = schemaversion or "unknown"
    if "SCORM" in schema and version == "unknown" and "adlcp_rootv1p2.xsd" in names:
        version = "1.2-inferred"
    if "SCORM" not in schema and "adlcp_rootv1p2.xsd" in names:
        version = "1.2-inferred"
    return root, org, resources, schema, version


def scorm_or_cc_graph(kind, seed, files, ppath, original_name):
    profile = PROFILE[kind]
    root, org, resources, schema, version = ims_manifest_info(files["imsmanifest.xml"], set(files))
    org_title = ""
    if org is not None:
        te = first_direct(org, "title")
        org_title = text_content(te)
    metadata_title = ""
    metadata_el = first_direct(root, "metadata")
    if metadata_el is not None:
        for title_el in metadata_el.iter():
            if local(title_el.tag) == "title":
                string_el = next((x for x in title_el.iter() if local(x.tag) in ("string", "langstring")), None)
                metadata_title = text_content(string_el) if string_el is not None else text_content(title_el)
                if metadata_title:
                    break
    resolved_title = org_title or metadata_title or original_name
    course_id = stable_urn(seed, "course", root.attrib.get("identifier") or original_name)
    entities = []
    course = {
        "id": course_id,
        "type": "course",
        "revision": 1,
        "title": title_map(resolved_title),
        "children": [],
        "extensions": {profile: {
            "manifest": "imsmanifest.xml",
            "sourceManifestIdentifier": root.attrib.get("identifier"),
            "sourceSchema": schema or None,
            "sourceSchemaVersion": version,
            "resourceCount": len(resources),
        }},
    }
    # Remove None values inside extension for clean I-JSON.
    course["extensions"][profile] = {k:v for k,v in course["extensions"][profile].items() if v is not None}
    entities.append(course)
    resource_entities = {}

    def resource_for(refid):
        if refid in resource_entities:
            return resource_entities[refid]["id"]
        src = resources.get(refid)
        meta = {"manifest": "imsmanifest.xml", "resourceIdentifier": refid}
        href = None; typ = None; scorm_type = None
        if src is not None:
            href = src.attrib.get("href"); typ = src.attrib.get("type")
            for k,val in src.attrib.items():
                if local(k).lower() == "scormtype": scorm_type = val
        member = href or first_resource_file(src)
        if href is not None: meta["href"] = href
        if member is not None: meta["member"] = member
        if typ is not None: meta["resourceType"] = typ
        if scorm_type is not None: meta["scormType"] = scorm_type
        if kind == "scorm": meta["scormVersion"] = version
        rid = stable_urn(seed, "resource", refid or href or "resource")
        reps = [rep(seed, profile, ppath, original_name, meta, "res-package:" + (refid or ""))]

        # Add a directly resolvable semantic representation while keeping the
        # source package byte-exact. package-member avoids copying member bytes.
        if kind == "scorm" and member and member in files:
            reps.append(member_rep(seed, PROFILE["scorm"], ppath, member, meta, "res-launch:" + (refid or ""), role="primary"))
        elif kind == "common-cartridge" and src is not None:
            st = typ or ""
            if st == "webcontent" and member and member in files:
                reps.append(member_rep(seed, PROFILE["web-content"], ppath, member, {"sourceProfile":"Common Cartridge","resourceIdentifier":refid}, "cc-web:" + refid, role="rendered"))
            elif "assessment" in st and member and member in files:
                qmeta = {"sourceStandard":"1EdTech QTI","sourceVersion":"1.2","resourceIdentifier":refid,"member":member,"preservedFrom":"Common Cartridge"}
                reps.append(member_rep(seed, PROFILE["qti"], ppath, member, qmeta, "cc-qti:" + refid, role="primary", media_type="application/xml"))
            elif "basiclti" in st:
                lmeta = basic_lti_metadata(files, src)
                if lmeta and lmeta.get("launchUrl"):
                    reps.append({
                        "id": stable_urn(seed,"representation","cc-lti:"+refid),
                        "role": "primary",
                        "mediaType": "application/vnd.ims.lti.v1.ltilink",
                        "profile": PROFILE["lti"],
                        "location": {"type":"remote","href":lmeta["launchUrl"]},
                        "extensions": {PROFILE["lti"]: {k:v for k,v in lmeta.items() if v is not None}},
                    })
            elif st.startswith("imswl_"):
                wlmeta=cc_web_link_metadata(files,src)
                if wlmeta and URI_RE.match(wlmeta["href"]):
                    reps.append({
                        "id":stable_urn(seed,"representation","cc-weblink:"+refid),
                        "role":"primary","mediaType":"text/html","profile":PROFILE["web-content"],
                        "location":{"type":"remote","href":wlmeta["href"]},
                        "extensions":{PROFILE["web-content"]:{"sourceProfile":"Common Cartridge","resourceIdentifier":refid,"sourceType":"web-link"}},
                    })
                    meta["webLink"]={k:v for k,v in wlmeta.items() if v is not None}
            elif st.startswith("imsdt_"):
                dmeta=cc_discussion_metadata(files,src)
                if dmeta: meta["discussionTopic"]=dmeta
                if member and member in files:
                    reps.append(member_rep(seed, profile, ppath, member, meta, "cc-discussion:" + refid, role="primary",media_type="application/xml"))
            elif member and member in files:
                reps.append(member_rep(seed, profile, ppath, member, meta, "cc-member:" + refid, role="primary"))

        r = {
            "id": rid, "type": "resource",
            "representations": reps,
            "extensions": {profile: {"sourceResourceIdentifier": refid, "resourceType": typ or "unknown"}},
        }
        resource_entities[refid] = r
        entities.append(r)
        return rid

    def activity_type(src_type):
        if kind == "scorm": return "https://p2rln.org/type/scorm-activity"
        src_type = src_type or ""
        if "assessment" in src_type: return "https://p2rln.org/type/assessment"
        if "basiclti" in src_type: return "https://p2rln.org/type/external-tool"
        if src_type.startswith("imsdt_"): return "https://p2rln.org/type/discussion"
        if src_type.startswith("imswl_"): return "https://p2rln.org/type/web-link"
        return "https://p2rln.org/type/resource-view"

    def project_item(item):
        src_id = item.attrib.get("identifier") or stable_urn(seed,"source-item","missing")
        refid = item.attrib.get("identifierref")
        title_el = first_direct(item, "title")
        title = text_content(title_el) or src_id
        children = [ch for ch in list(item) if local(ch.tag) == "item"]
        if refid:
            src_res = resources.get(refid)
            src_type = src_res.attrib.get("type") if src_res is not None else None
            eid = stable_urn(seed, "activity", src_id)
            e = {
                "id": eid, "type": "activity", "activityType": activity_type(src_type),
                "title": title_map(title), "resource": resource_for(refid),
                "extensions": {profile: {"sourceItemIdentifier": src_id, "sourceResourceIdentifier": refid}},
            }
            if children:
                e["children"] = [project_item(ch) for ch in children]
            entities.append(e)
            return eid
        eid = stable_urn(seed, "unit", src_id)
        e = {
            "id": eid, "type": "unit", "role": "https://p2rln.org/role/source-group",
            "title": title_map(title), "children": [],
            "extensions": {profile: {"sourceItemIdentifier": src_id}},
        }
        entities.append(e)
        e["children"] = [project_item(ch) for ch in children]
        return eid

    if org is not None:
        course["children"] = [project_item(ch) for ch in list(org) if local(ch.tag) == "item"]
    if kind == "common-cartridge":
        # Preserve and address every manifest resource, including resources not
        # reachable from the selected organization. This is required for a
        # faithful archive/round-trip and exposes the full cartridge inventory.
        for refid in sorted(resources):
            resource_for(refid)
    # summary of source resource types (including non-projected resources)
    type_counts = Counter((r.attrib.get("type") or "unknown") for r in resources.values())
    course["extensions"][profile]["resourceTypeCounts"] = dict(sorted(type_counts.items()))
    if kind == "scorm":
        course["extensions"][profile]["scoCount"] = sum(
            1 for r in resources.values()
            if any(local(k).lower() == "scormtype" and val.lower() == "sco" for k, val in r.attrib.items())
        )
    else:
        course["extensions"][profile]["cartridgeVersion"] = version
    return entities, course_id, {"title": resolved_title, "version": version, "resourceCount": len(resources)}



def _manifest_lom_title(root):
    metadata = first_direct(root, "metadata")
    if metadata is None:
        return ""
    for title_el in metadata.iter():
        if local(title_el.tag) == "title":
            string_el = next((x for x in title_el.iter() if local(x.tag) in ("string", "langstring")), None)
            value = text_content(string_el) if string_el is not None else text_content(title_el)
            if value:
                return value
    return ""


def _resource_lom_title(src):
    if src is None:
        return ""
    metadata = first_direct(src, "metadata")
    if metadata is None:
        return ""
    for title_el in metadata.iter():
        if local(title_el.tag) == "title":
            string_el = next((x for x in title_el.iter() if local(x.tag) in ("string", "langstring")), None)
            value = text_content(string_el) if string_el is not None else text_content(title_el)
            if value:
                return value
    return ""


def _qti_interaction_types(src):
    out=[]
    if src is None:
        return out
    for el in src.iter():
        if local(el.tag) == "interactionType":
            value=text_content(el)
            if value and value not in out:
                out.append(value)
    return out


def qti_graph(seed, files, ppath, original_name):
    """Project a packaged QTI assessment without rewriting QTI item semantics."""
    profile = PROFILE["qti"]
    root = ET.fromstring(files["imsmanifest.xml"])
    schema=""; version="unknown"
    for el in root.iter():
        if local(el.tag)=="schema" and el.text: schema=el.text.strip()
        if local(el.tag)=="schemaversion" and el.text: version=el.text.strip()
    resources=[el for el in root.iter() if local(el.tag)=="resource" and el.attrib.get("identifier")]
    title=_manifest_lom_title(root) or original_name
    course_id=stable_urn(seed,"course",root.attrib.get("identifier") or original_name)
    course={
        "id":course_id,"type":"course","revision":1,"title":title_map(title),"children":[],
        "extensions":{profile:{
            "manifest":"imsmanifest.xml","sourceManifestIdentifier":root.attrib.get("identifier"),
            "sourceSchema":schema or "QTI Package","sourceVersion":version,"resourceCount":len(resources),
        }},
    }
    course["extensions"][profile]={k:v for k,v in course["extensions"][profile].items() if v is not None}
    entities=[course]
    resource_map={}
    item_count=0; test_count=0; support_count=0
    for src in resources:
        refid=src.attrib.get("identifier")
        rtype=src.attrib.get("type") or "unknown"
        member=src.attrib.get("href") or first_resource_file(src)
        meta={
            "manifest":"imsmanifest.xml","resourceIdentifier":refid,"resourceType":rtype,
            "sourceVersion":version,"member":member,
        }
        interactions=_qti_interaction_types(src)
        if interactions: meta["interactionTypes"]=interactions
        dependencies=[el.attrib.get("identifierref") for el in list(src) if local(el.tag)=="dependency" and el.attrib.get("identifierref")]
        if dependencies: meta["dependencies"]=dependencies
        rid=stable_urn(seed,"resource","qti:"+refid)
        reps=[rep(seed,profile,ppath,original_name,meta,"qti-package:"+refid)]
        lower=rtype.lower()
        is_item="qti_item" in lower or "assessmentitem" in lower or "item_xml" in lower
        is_test="qti_test" in lower or "assessmenttest" in lower or "test_xml" in lower
        if member and member in files:
            media="application/xml" if member.lower().endswith(".xml") else (mimetypes.guess_type(member)[0] or "application/octet-stream")
            if is_item or is_test:
                reps.append(member_rep(seed,profile,ppath,member,meta,"qti-member:"+refid,role="primary",media_type=media))
            else:
                support_meta={"sourceProfile":"QTI","sourceVersion":version,"resourceIdentifier":refid}
                reps.append(member_rep(seed,PROFILE["web-content"],ppath,member,support_meta,"qti-support:"+refid,role="primary",media_type=media))
        title_r=_resource_lom_title(src) or refid
        resource={
            "id":rid,"type":"resource","title":title_map(title_r),"representations":reps,
            "extensions":{profile:{"sourceResourceIdentifier":refid,"resourceType":rtype,"dependencies":dependencies}},
        }
        entities.append(resource); resource_map[refid]=rid
        if is_item or is_test:
            aid=stable_urn(seed,"activity","qti:"+refid)
            atype="https://p2rln.org/type/assessment-test" if is_test else "https://p2rln.org/type/assessment-item"
            act={
                "id":aid,"type":"activity","activityType":atype,"title":title_map(title_r),"resource":rid,
                "extensions":{profile:{"sourceResourceIdentifier":refid,"sourceVersion":version,"resourceType":rtype}},
            }
            if interactions: act["extensions"][profile]["interactionTypes"]=interactions
            entities.append(act); course["children"].append(aid)
            if is_test: test_count+=1
            else: item_count+=1
        else:
            support_count+=1
    course["extensions"][profile].update({"itemCount":item_count,"testCount":test_count,"supportResourceCount":support_count})
    return entities,course_id,{"title":title,"version":version,"itemCount":item_count,"testCount":test_count,"resourceCount":len(resources)}

def h5p_graph(seed, files, ppath, original_name):
    profile = PROFILE["h5p"]
    h = json.loads(files["h5p.json"].decode("utf-8"))
    declared=[]
    for bucket in ("preloadedDependencies","dynamicDependencies","editorDependencies"):
        for d in h.get(bucket,[]):
            declared.append({"kind":bucket,"machineName":d.get("machineName"),"majorVersion":d.get("majorVersion"),"minorVersion":d.get("minorVersion")})
    embedded=set()
    embedded_names=set()
    for name,data in files.items():
        if name.count("/") == 1 and name.endswith("/library.json"):
            try:
                lib=json.loads(data.decode("utf-8")); mn=lib.get("machineName")
                major=int(lib.get("majorVersion")); minor=int(lib.get("minorVersion"))
                if mn:
                    embedded.add((str(mn),major,minor))
                    embedded_names.add(str(mn))
            except Exception:
                pass
    required=set()
    for d in h.get("preloadedDependencies",[]):
        try:
            if d.get("machineName"):
                required.add((str(d["machineName"]),int(d["majorVersion"]),int(d["minorVersion"])))
        except (KeyError,TypeError,ValueError):
            continue
    matched=required.intersection(embedded)
    missing=required.difference(embedded)
    if required and not missing: mode="bundled"
    elif matched: mode="mixed"
    else: mode="external"
    title=h.get("title") or original_name; lang=h.get("language") or "und"
    course_id=stable_urn(seed,"course",title)
    act_id=stable_urn(seed,"activity","h5p")
    res_id=stable_urn(seed,"resource","h5p")
    metadata={
        "mainLibrary":h.get("mainLibrary"), "language":lang, "embedTypes":h.get("embedTypes",[]),
        "dependencyMode":mode, "declaredDependencies":declared, "embeddedLibraryCount":len(embedded),
        "missingPreloadedDependencies":[
            {"machineName":mn,"majorVersion":major,"minorVersion":minor}
            for mn,major,minor in sorted(missing)
        ],
    }
    metadata={k:v for k,v in metadata.items() if v is not None}
    entities=[
        {"id":course_id,"type":"course","revision":1,"title":title_map(title,lang),"languages":[lang] if lang else [],"children":[act_id]},
        {"id":act_id,"type":"activity","activityType":"https://p2rln.org/type/h5p","title":title_map(title,lang),"resource":res_id},
        {"id":res_id,"type":"resource","title":title_map(title,lang),"representations":[rep(seed,profile,ppath,original_name,metadata,"h5p")]},
    ]
    return entities,course_id,{"title":title,"mainLibrary":h.get("mainLibrary"),"dependencyMode":mode,"embeddedLibraryCount":len(embedded)}


def cmi5_graph(seed, files, ppath, original_name):
    profile=PROFILE["cmi5"]
    root=ET.fromstring(files["cmi5.xml"])
    course_src=next((ch for ch in list(root) if local(ch.tag)=="course"),None)
    source_course_id=course_src.attrib.get("id") if course_src is not None else None
    course_id=portable_id(seed,"course",source_course_id)
    title=langmap(first_direct(course_src,"title")) if course_src is not None else {}
    desc=langmap(first_direct(course_src,"description")) if course_src is not None else {}
    if not title: title=title_map(original_name)
    entities=[]
    course={"id":course_id,"type":"course","revision":1,"title":title,"children":[],"extensions":{profile:{"manifest":"cmi5.xml","sourceCourseId":source_course_id}}}
    if desc: course["description"]=desc
    course["extensions"][profile]={k:v for k,v in course["extensions"][profile].items() if v is not None}
    entities.append(course)
    au_count=0; block_count=0
    def project(el):
        nonlocal au_count, block_count
        ln=local(el.tag); src=el.attrib.get("id")
        tm=langmap(first_direct(el,"title")) or title_map(src or ln)
        dm=langmap(first_direct(el,"description"))
        if ln=="block":
            block_count+=1
            eid=portable_id(seed,"unit",src)
            e={"id":eid,"type":"unit","role":"https://p2rln.org/role/cmi5-block","title":tm,"children":[],"extensions":{profile:{"sourceId":src}}}
            if dm:e["description"]=dm
            entities.append(e)
            e["children"]=[project(ch) for ch in list(el) if local(ch.tag) in ("block","au")]
            return eid
        if ln=="au":
            au_count+=1
            eid=portable_id(seed,"activity",src)
            rid=stable_urn(seed,"resource","au:"+(src or str(au_count)))
            meta={"manifest":"cmi5.xml","auId":src}
            for attr in ("moveOn","masteryScore","launchMethod"):
                if attr in el.attrib: meta[attr]=el.attrib[attr]
            for child_name,key in (("url","url"),("launchParameters","launchParameters"),("entitlementKey","entitlementKey")):
                child=first_direct(el,child_name); val=text_content(child)
                if val: meta[key]=val
            reps=[rep(seed,profile,ppath,original_name,meta,"au-package:"+(src or str(au_count)))]
            launch=meta.get("url")
            if launch:
                if URI_RE.match(launch):
                    reps.append({
                        "id":stable_urn(seed,"representation","au-launch:"+(src or str(au_count))),
                        "role":"primary","mediaType":"text/html","profile":profile,
                        "location":{"type":"remote","href":launch},"extensions":{profile:meta},
                    })
                elif launch in files:
                    reps.append(member_rep(seed,profile,ppath,launch,meta,"au-launch:"+(src or str(au_count)),role="primary"))
            res={"id":rid,"type":"resource","representations":reps}
            act={"id":eid,"type":"activity","activityType":"https://p2rln.org/type/cmi5-au","title":tm,"resource":rid,"extensions":{profile:{k:v for k,v in meta.items() if k!="manifest"}}}
            if dm: act["description"]=dm
            entities.extend([res,act]); return eid
        raise ValueError(f"unsupported cmi5 structural element {ln}")
    course["children"]=[project(ch) for ch in list(root) if local(ch.tag) in ("block","au")]
    course["extensions"][profile].update({"auCount":au_count,"blockCount":block_count})
    return entities,course_id,{"title":next(iter(title.values())),"auCount":au_count,"blockCount":block_count}


def tincan_graph(seed, files, ppath, original_name):
    profile=PROFILE["tincan-package"]
    root=ET.fromstring(files["tincan.xml"])
    act_src=next((el for el in root.iter() if local(el.tag).lower()=="activity"),None)
    src_id=act_src.attrib.get("id") if act_src is not None else None
    name=""; description=""; launch=""
    if act_src is not None:
        for el in act_src.iter():
            ln=local(el.tag).lower()
            if ln=="name" and not name: name=text_content(el)
            elif ln=="description" and not description: description=text_content(el)
            elif ln=="launch" and not launch: launch=text_content(el)
    title=name or original_name
    course_id=stable_urn(seed,"course",src_id or title)
    aid=stable_urn(seed,"activity",src_id or title); rid=stable_urn(seed,"resource",src_id or title)
    meta={"manifest":"tincan.xml","sourceActivityId":src_id,"launch":launch}
    meta={k:v for k,v in meta.items() if v}
    entities=[
        {"id":course_id,"type":"course","revision":1,"title":title_map(title),"children":[aid]},
        {"id":aid,"type":"activity","activityType":"https://p2rln.org/type/legacy-tincan-package","title":title_map(title),"resource":rid,"extensions":{profile:meta}},
        {"id":rid,"type":"resource","representations":[rep(seed,profile,ppath,original_name,meta,"tincan")]},
    ]
    return entities,course_id,{"title":title,"sourceActivityId":src_id,"launch":launch}



def build_transformation_report(kind, src, original_name, source_hex, package_hex, ppath, normalized_root, entities, course_id):
    mappings=[]
    source_profile=PROFILE[kind]
    for e in entities:
        ext=(e.get("extensions") or {}).get(source_profile,{})
        locator=None
        if e["type"]=="course":
            sid=ext.get("sourceManifestIdentifier") or ext.get("sourceCourseId") or ext.get("sourceActivityId")
            locator=f"{('imsmanifest.xml' if kind in ('scorm','common-cartridge','qti') else 'cmi5.xml' if kind=='cmi5' else 'tincan.xml' if kind=='tincan-package' else 'h5p.json')}#{sid or 'root'}"
        elif e["type"] in ("unit","activity"):
            sid=ext.get("sourceItemIdentifier") or ext.get("sourceResourceIdentifier") or ext.get("sourceId") or ext.get("auId") or ext.get("sourceActivityId")
            if sid:
                locator=f"source#{sid}"
        elif e["type"]=="resource":
            sid=ext.get("sourceResourceIdentifier") or ext.get("resourceIdentifier")
            if sid:
                locator=f"resource#{sid}"
        if locator:
            mappings.append({"sourceLocator":locator,"targetId":e["id"],"targetType":e["type"],"operation":"projected","fidelity":"semantic"})
        if e["type"]=="resource":
            for rep_obj in e.get("representations",[]):
                loc=rep_obj.get("location",{})
                if rep_obj.get("role")=="original-package":
                    mappings.append({
                        "sourceLocator":original_name,
                        "targetId":rep_obj["id"],
                        "targetType":"representation",
                        "operation":"preserved",
                        "fidelity":"exact" if normalized_root is None else "semantic",
                    })
                elif loc.get("type")=="package-member":
                    mappings.append({
                        "sourceLocator":f"{original_name}#{loc['member']}",
                        "targetId":rep_obj["id"],
                        "targetType":"representation",
                        "operation":"projected",
                        "fidelity":"exact",
                    })
    # Stable de-duplication. The same package representation can be referenced by
    # several graph resources; one mapping is enough for the audit trail.
    unique=[]; seen=set()
    for m in mappings:
        key=(m["sourceLocator"],m["targetId"],m["targetType"],m["operation"])
        if key not in seen:
            seen.add(key); unique.append(m)
    warnings=[]
    fidelity="minimal"
    if kind=="common-cartridge":
        fidelity="partial"
        warnings.append("Common Cartridge organization and full manifest resource inventory are projected; source-standard-specific XML remains authoritative inside the preserved cartridge.")
        warnings.append("Legacy QTI 1.2 resources are surfaced as QTI representations but are not silently migrated to QTI 3.")
        warnings.append("Legacy Basic LTI resources are projected as external-tool intent and require local LTI re-binding; they are not relabeled as completed LTI 1.3 registrations.")
    elif kind=="scorm":
        fidelity="partial"; warnings.append("SCORM hierarchy/launch metadata are projected; SCORM sequencing and runtime data-model semantics remain authoritative in the preserved SCORM package.")
    elif kind=="cmi5":
        fidelity="partial"; warnings.append("cmi5 course/block/AU structure is projected; runtime/xAPI execution semantics remain authoritative to cmi5/xAPI.")
    elif kind=="qti":
        fidelity="partial"; warnings.append("QTI package/item/test inventory and launchable members are projected; QTI item/test scoring, interaction and processing semantics remain authoritative in the preserved QTI package.")
    elif kind=="h5p":
        fidelity="minimal"; warnings.append("H5P package metadata and dependency mode are projected; H5P library/content semantics remain authoritative inside the preserved .h5p package.")
    elif kind=="tincan-package":
        fidelity="minimal"; warnings.append("Legacy tincan.xml launch metadata is projected without claiming modern xAPI package standardization.")
    losses=[]
    if normalized_root is not None:
        losses.append({
            "sourceLocator":str(src),
            "reason":"Files outside --package-root are intentionally excluded from the normalized educational subpackage.",
            "recoverableFromPreservedPackage":False,
        })
    return {
        "version":"0.4.0",
        "source":{
            "format":kind,"fileName":src.name,"byteDigest":"sha256:"+source_hex,
            "preservedPackageDigest":"sha256:"+package_hex,"preservedPath":ppath,
            "preservation":"normalized-subpackage" if normalized_root else "bit-exact",
            **({"normalizedFromRoot":normalized_root} if normalized_root else {}),
        },
        "target":{"format":"P2RLN","formatVersion":"0.4.0","entrypoint":course_id},
        "fidelity":{
            "sourceBytes":"normalized" if normalized_root else "exact",
            "structuralProjection":fidelity,
            "runtimeSemantics":"delegated-to-source-profile",
        },
        "mappings":unique,"warnings":warnings,"losses":losses,
    }


def profiles_used(entities):
    used=set()
    for e in entities:
        for ns in (e.get("extensions") or {}):
            if ns.startswith("https://p2rln.org/profile/"):
                used.add(ns)
        if e.get("type")=="resource":
            for r in e.get("representations",[]):
                if r.get("profile"): used.add(r["profile"])
        if e.get("type")=="activity":
            for ns in (e.get("extensions") or {}):
                if ns.startswith("https://p2rln.org/profile/"): used.add(ns)
    return used

def wrap(src: Path, dst: Path, package_root: str | None = None):
    original_bytes, package_bytes, files, normalized_root = load_source(src, package_root)
    kind=detect(files); profile=PROFILE[kind]
    source_hex=hashlib.sha256(original_bytes).hexdigest(); package_hex=hashlib.sha256(package_bytes).hexdigest()
    seed=package_hex
    ppath,pdigest=package_path(package_bytes)
    original_name=(PurePosixPath(package_root).name+".zip") if package_root else src.name
    if kind in ("scorm","common-cartridge"):
        entities,course_id,details=scorm_or_cc_graph(kind,seed,files,ppath,original_name)
    elif kind=="qti": entities,course_id,details=qti_graph(seed,files,ppath,original_name)
    elif kind=="h5p": entities,course_id,details=h5p_graph(seed,files,ppath,original_name)
    elif kind=="cmi5": entities,course_id,details=cmi5_graph(seed,files,ppath,original_name)
    elif kind=="tincan-package": entities,course_id,details=tincan_graph(seed,files,ppath,original_name)
    else: raise AssertionError(kind)
    transform_report=build_transformation_report(kind,src,original_name,source_hex,package_hex,ppath,normalized_root,entities,course_id)
    transform_path="provenance/transformation.json"
    graph={"graphVersion":"0.4.0","entities":entities,"relations":[],"extensions":{
        "org.p2rln.import":{
            "sourceFormat":kind,"sourceSha256":"sha256:"+source_hex,"packageSha256":"sha256:"+package_hex,
            **({"normalizedFromRoot":normalized_root} if normalized_root else {})
        },
        "org.p2rln.transform":{"report":transform_path,"version":"0.4.0"}
    }}
    graph_bytes=(json.dumps(graph,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    graph_desc={"path":"content/graph.json","mediaType":"application/json","size":len(graph_bytes),"byteDigest":v.sha256(graph_bytes),"contentDigest":v.sha256(v.jcs_bytes(graph)),"schema":"https://p2rln.org/schema/graph/0.4.0"}
    transform_bytes=(json.dumps(transform_report,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    transform_desc={"path":transform_path,"mediaType":"application/json","size":len(transform_bytes),"byteDigest":v.sha256(transform_bytes),"contentDigest":v.content_digest(transform_bytes,"application/json",transform_path)}
    file_desc=desc_for_payload(ppath,package_bytes)
    used=profiles_used(entities)|{profile}
    profile_decls=[{"id":"https://p2rln.org/profile/course","version":"0.4.0","requirement":"required"}]
    for pid in sorted(used):
        if pid=="https://p2rln.org/profile/course": continue
        profile_decls.append({"id":pid,"version":"0.4.0","requirement":"required" if pid==profile else "optional"})
    manifest={
        "format":"P2RLN","formatVersion":"0.4.0",
        "packageId":stable_urn(seed,"package","p2rln-wrapper"),
        "entrypoints":[{"id":course_id,"type":"course","role":"primary"}],
        "graph":graph_desc,
        "profiles":profile_decls,
        "files":[file_desc,transform_desc],
        "integrity":{"algorithm":"sha256","contentRoot":"sha256:"+"0"*64},
    }
    manifest["integrity"]["contentRoot"]=v.compute_content_root(manifest)
    manifest_bytes=(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    dst.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(dst,"w",zipfile.ZIP_DEFLATED,allowZip64=True) as zout:
        zout.writestr("META-INF/manifest.json",manifest_bytes)
        zout.writestr("content/graph.json",graph_bytes)
        zout.writestr(transform_path,transform_bytes)
        zi=zipfile.ZipInfo(ppath,date_time=(1980,1,1,0,0,0)); zi.compress_type=zipfile.ZIP_STORED; zi.external_attr=0o100644<<16
        zout.writestr(zi,package_bytes)
    validation=v.validate_package(dst,strict_profiles=True,validate_profile_payloads_flag=True)
    return {
        "source":str(src),"packageRoot":package_root,"detectedFormat":kind,"profile":profile,
        "sourceSha256":"sha256:"+source_hex,"preservedPackageSha256":"sha256:"+package_hex,
        "preservedBitForBit": package_root is None,
        "details":details,"entities":len(entities),"p2rln":str(dst),"validation":validation,
        "transformation":{"fidelity":transform_report["fidelity"],"warnings":transform_report["warnings"],"losses":transform_report["losses"]},
    }


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("source",type=Path)
    ap.add_argument("output",type=Path)
    ap.add_argument("--package-root",help="Subdirectory inside a repository/archive to normalize as the package root")
    ap.add_argument("--report",type=Path)
    args=ap.parse_args()
    report=wrap(args.source,args.output,args.package_root)
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
