from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from urllib.parse import urlsplit
import zipfile

from . import validator as _validate
from .native_composite import PROFILE as NATIVE_COMPOSITE_PROFILE
from .native_component import PROFILE as NATIVE_COMPONENT_PROFILE
from .native_questionnaire import PROFILE as NATIVE_QUESTIONNAIRE_PROFILE


class ReadError(Exception):
    pass


@dataclass(frozen=True)
class CapabilitySet:
    """Normalized capabilities used by representation negotiation."""

    profiles: dict[str, frozenset[str]]

    @classmethod
    def from_document(cls, obj: dict[str, Any]) -> "CapabilitySet":
        profiles: dict[str, frozenset[str]] = {}
        for p in obj.get("profiles", []):
            profiles[p["id"]] = frozenset(p.get("modes", []))
        return cls(profiles)

    @classmethod
    def from_path(cls, path: Path | str) -> "CapabilitySet":
        return cls.from_document(json.loads(Path(path).read_text(encoding="utf-8")))

    @classmethod
    def permissive_reader(cls, declared_profiles: Iterable[str]) -> "CapabilitySet":
        return cls({p: frozenset({"validate", "read", "preserve", "deliver"}) for p in declared_profiles})

    def supports(self, profile: str | None, mode: str) -> bool:
        if profile is None:
            return True
        return mode in self.profiles.get(profile, frozenset())


ROLE_SCORE = {
    "primary": 40,
    "rendered": 35,
    "accessible": 34,
    "fallback": 20,
    "source": 10,
    "original-package": 5,
}

MODE_SCORE = {
    "deliver": 100,
    "read": 70,
    "preserve": 10,
}


class P2RLNReader:
    """Safe structural reader for a P2RLN package.

    Opening performs Core validation.  It does not execute package code and it
    never dereferences remote URLs.  Profile-specific methods only produce a
    deterministic *read plan* describing what another runtime would need to do.
    """

    def __init__(
        self,
        path: Path | str,
        *,
        strict_profiles: bool = True,
        validate_profile_payloads: bool = False,
    ) -> None:
        self.path = Path(path)
        try:
            self.validation = _validate.validate_package(
                self.path,
                strict_profiles=strict_profiles,
                validate_profile_payloads_flag=validate_profile_payloads,
            )
        except Exception as exc:
            raise ReadError(str(exc)) from exc

        with zipfile.ZipFile(self.path) as zf:
            self.manifest = json.loads(zf.read("META-INF/manifest.json"))
            self.graph = json.loads(zf.read("content/graph.json"))

        self.entities: dict[str, dict[str, Any]] = {}
        for entity in self.graph["entities"]:
            eid = entity["id"]
            if eid in self.entities:
                raise ReadError(f"duplicate entity id: {eid}")
            self.entities[eid] = entity

        self.representations: dict[str, tuple[str, dict[str, Any]]] = {}
        for entity in self.entities.values():
            if entity["type"] != "resource":
                continue
            for rep in entity.get("representations", []):
                rid = rep["id"]
                if rid in self.representations:
                    raise ReadError(f"duplicate representation id: {rid}")
                self.representations[rid] = (entity["id"], rep)

        self.declared_profiles = {p["id"]: p for p in self.manifest.get("profiles", [])}
        self.entrypoints = list(self.manifest.get("entrypoints", []))

    def summary(self) -> dict[str, Any]:
        counts: dict[str, int] = {}
        for e in self.entities.values():
            counts[e["type"]] = counts.get(e["type"], 0) + 1
        return {
            "path": str(self.path),
            "format": self.manifest["format"],
            "formatVersion": self.manifest["formatVersion"],
            "packageId": self.manifest["packageId"],
            "contentRoot": self.manifest["integrity"]["contentRoot"],
            "entrypoints": self.entrypoints,
            "profiles": list(self.manifest.get("profiles", [])),
            "entityCounts": dict(sorted(counts.items())),
            "fileCount": len(self.manifest.get("files", [])),
        }

    def entity(self, entity_id: str) -> dict[str, Any]:
        try:
            return self.entities[entity_id]
        except KeyError as exc:
            raise ReadError(f"unknown entity: {entity_id}") from exc

    def primary_entrypoint(self) -> dict[str, Any]:
        for ep in self.entrypoints:
            if ep.get("role") == "primary":
                return ep
        if not self.entrypoints:
            raise ReadError("package has no entrypoint")
        return self.entrypoints[0]

    @staticmethod
    def _display_title(entity: dict[str, Any], preferred_languages: tuple[str, ...]) -> str:
        title = entity.get("title") or {}
        for lang in preferred_languages:
            if lang in title:
                return title[lang]
        for lang, value in title.items():
            if lang != "und":
                return value
        return title.get("und") or entity["id"]

    def tree(self, entrypoint_id: str | None = None, *, preferred_languages: tuple[str, ...] = ("es", "en", "und")) -> dict[str, Any]:
        eid = entrypoint_id or self.primary_entrypoint()["id"]
        visiting: set[str] = set()

        def build(node_id: str) -> dict[str, Any]:
            if node_id in visiting:
                raise ReadError(f"cycle while reading hierarchy at {node_id}")
            entity = self.entity(node_id)
            visiting.add(node_id)
            result = {
                "id": node_id,
                "type": entity["type"],
                "title": self._display_title(entity, preferred_languages),
            }
            if entity["type"] == "unit":
                result["role"] = entity.get("role")
            if entity["type"] == "activity":
                result["activityType"] = entity.get("activityType")
                if entity.get("resource"):
                    result["resource"] = entity["resource"]
            children = entity.get("children", [])
            if children:
                result["children"] = [build(c) for c in children]
            visiting.remove(node_id)
            return result

        return build(eid)

    def _representation_candidates(self, resource_id: str) -> list[dict[str, Any]]:
        resource = self.entity(resource_id)
        if resource["type"] != "resource":
            raise ReadError(f"entity is not a resource: {resource_id}")
        return list(resource.get("representations", []))

    def choose_representation(
        self,
        resource_id: str,
        capabilities: CapabilitySet,
        *,
        mode: str = "deliver",
        prefer_embedded: bool = True,
    ) -> dict[str, Any] | None:
        if mode not in MODE_SCORE:
            raise ReadError(f"unsupported negotiation mode: {mode}")
        ranked: list[tuple[int, str, dict[str, Any]]] = []
        candidates = self._representation_candidates(resource_id)
        # If a resource exposes an explicit semantic representation (primary,
        # rendered, accessible or fallback), read/deliver MUST NOT silently
        # fall back to an unrelated whole-source `original-package`. That would
        # confuse preservation of bytes with understanding the activity.
        semantic_roles = {"primary", "rendered", "accessible", "fallback"}
        has_semantic = any(rep.get("role") in semantic_roles for rep in candidates)
        for rep in candidates:
            if mode in {"read", "deliver"} and has_semantic and rep.get("role") not in semantic_roles:
                continue
            profile = rep.get("profile")
            if not capabilities.supports(profile, mode):
                continue
            score = MODE_SCORE[mode] + ROLE_SCORE.get(rep.get("role"), 0)
            if prefer_embedded and rep.get("location", {}).get("type") == "embedded":
                score += 3
            ranked.append((score, rep["id"], rep))
        if not ranked:
            return None
        ranked.sort(key=lambda x: (-x[0], x[1]))
        return ranked[0][2]

    def _profile_extension(self, rep: dict[str, Any]) -> dict[str, Any]:
        profile = rep.get("profile")
        return (rep.get("extensions") or {}).get(profile, {}) if profile else {}

    @staticmethod
    def _is_absolute_uri(value: str) -> bool:
        return bool(urlsplit(value).scheme)

    def representation_plan(self, rep: dict[str, Any]) -> dict[str, Any]:
        """Turn a representation into a side-effect-free resolution plan."""
        profile = rep.get("profile")
        location = rep.get("location", {})
        ext = self._profile_extension(rep)
        base = {
            "representationId": rep["id"],
            "profile": profile,
            "role": rep.get("role"),
            "mediaType": rep.get("mediaType"),
        }

        if profile == NATIVE_COMPOSITE_PROFILE:
            if location.get("type") != "embedded":
                raise ReadError("native composite representation must be embedded")
            return {
                **base,
                "kind": "native-composite",
                "path": location["path"],
                "runtime": "p2rln-native-composite",
                "metadata": ext,
            }

        if profile == NATIVE_COMPONENT_PROFILE:
            if location.get("type") != "embedded":
                raise ReadError("native component representation must be embedded")
            return {
                **base,
                "kind": "native-component",
                "path": location["path"],
                "runtime": "p2rln-native-component",
                "metadata": ext,
            }

        if profile == NATIVE_QUESTIONNAIRE_PROFILE:
            if location.get("type") != "embedded":
                raise ReadError("native questionnaire representation must be embedded")
            return {
                **base,
                "kind": "native-questionnaire",
                "path": location["path"],
                "runtime": "p2rln-native-questionnaire",
                "metadata": ext,
            }

        if location.get("type") == "package-member":
            runtime = {
                "https://p2rln.org/profile/scorm": "scorm",
                "https://p2rln.org/profile/cmi5": "cmi5",
                "https://p2rln.org/profile/common-cartridge": "common-cartridge",
                "https://p2rln.org/profile/qti": "qti",
                "https://p2rln.org/profile/web-content": "passive",
                "https://p2rln.org/profile/tincan-package": "xapi-legacy",
            }.get(profile, "profile-defined")
            return {**base, "kind": "package-member", "packagePath": location["package"], "member": location["member"], "runtime": runtime, "metadata": ext}

        if profile == "https://p2rln.org/profile/scorm":
            href = ext.get("href")
            if href:
                return {**base, "kind": "package-member", "packagePath": location.get("path"), "member": href, "runtime": "scorm", "metadata": ext}
            return {**base, "kind": "package", "packagePath": location.get("path"), "runtime": "scorm", "metadata": ext}

        if profile == "https://p2rln.org/profile/cmi5":
            launch = ext.get("url")
            if launch:
                if self._is_absolute_uri(launch):
                    return {**base, "kind": "remote", "href": launch, "runtime": "cmi5", "networkRequired": True, "metadata": ext}
                return {**base, "kind": "package-member", "packagePath": location.get("path"), "member": launch, "runtime": "cmi5", "metadata": ext}
            return {**base, "kind": "package", "packagePath": location.get("path"), "runtime": "cmi5", "metadata": ext}

        if profile == "https://p2rln.org/profile/h5p":
            return {**base, "kind": "package", "packagePath": location.get("path"), "runtime": "h5p", "metadata": ext}

        if profile == "https://p2rln.org/profile/tincan-package":
            launch = ext.get("launch")
            if launch:
                if self._is_absolute_uri(launch):
                    return {**base, "kind": "remote", "href": launch, "runtime": "xapi-legacy", "networkRequired": True, "metadata": ext}
                return {**base, "kind": "package-member", "packagePath": location.get("path"), "member": launch, "runtime": "xapi-legacy", "metadata": ext}
            return {**base, "kind": "package", "packagePath": location.get("path"), "runtime": "xapi-legacy", "metadata": ext}

        if profile == "https://p2rln.org/profile/common-cartridge":
            member = ext.get("href") or ext.get("member")
            if member:
                return {**base, "kind": "package-member", "packagePath": location.get("path"), "member": member, "runtime": "passive", "metadata": ext}
            return {**base, "kind": "package", "packagePath": location.get("path"), "runtime": "common-cartridge", "metadata": ext}

        if profile == "https://p2rln.org/profile/qti":
            member = ext.get("member") or ext.get("href")
            if member:
                return {**base, "kind": "package-member", "packagePath": location.get("path"), "member": member, "runtime": "qti", "metadata": ext}
            return {**base, "kind": "package", "packagePath": location.get("path"), "runtime": "qti", "metadata": ext}

        if profile == "https://p2rln.org/profile/lti":
            # LTI configuration is intentionally not a naked GET.  A receiving
            # platform must re-bind registration/deployment credentials locally.
            return {
                **base,
                "kind": "external-tool",
                "runtime": "lti",
                "rebindRequired": bool(ext.get("rebindRequired", True)),
                "targetLinkUri": ext.get("targetLinkUri") or ext.get("launchUrl"),
                "metadata": ext,
            }

        if location.get("type") == "embedded":
            return {**base, "kind": "embedded-file", "path": location["path"]}
        if location.get("type") == "remote":
            return {**base, "kind": "remote", "href": location["href"], "networkRequired": True}
        raise ReadError(f"unsupported representation location: {rep['id']}")

    def activity_plan(
        self,
        activity_id: str,
        capabilities: CapabilitySet,
        *,
        mode: str = "deliver",
    ) -> dict[str, Any]:
        activity = self.entity(activity_id)
        if activity["type"] != "activity":
            raise ReadError(f"entity is not an activity: {activity_id}")
        resource_id = activity.get("resource")
        if not resource_id:
            return {"activityId": activity_id, "status": "no-resource"}
        rep = self.choose_representation(resource_id, capabilities, mode=mode)
        if rep is None:
            return {
                "activityId": activity_id,
                "resourceId": resource_id,
                "status": "unsupported",
                "availableProfiles": [r.get("profile") for r in self._representation_candidates(resource_id)],
            }
        return {
            "activityId": activity_id,
            "resourceId": resource_id,
            "status": "ready",
            "plan": self.representation_plan(rep),
        }

    def course_read_plan(self, capabilities: CapabilitySet, entrypoint_id: str | None = None, *, mode: str = "deliver") -> dict[str, Any]:
        root = entrypoint_id or self.primary_entrypoint()["id"]
        activities: list[dict[str, Any]] = []
        visited: set[str] = set()

        def walk(eid: str) -> None:
            if eid in visited:
                return
            visited.add(eid)
            e = self.entity(eid)
            if e["type"] == "activity":
                activities.append(self.activity_plan(eid, capabilities, mode=mode))
            for child in e.get("children", []):
                walk(child)

        walk(root)
        ready = sum(1 for p in activities if p["status"] == "ready")
        unsupported = sum(1 for p in activities if p["status"] == "unsupported")
        return {
            "entrypoint": root,
            "mode": mode,
            "activities": activities,
            "summary": {"total": len(activities), "ready": ready, "unsupported": unsupported},
        }

    def resource_import_plan(self, resource_id: str, capabilities: CapabilitySet) -> dict[str, Any]:
        """Plan how a target system can ingest one resource without assigning local IDs.

        Preference is semantic read. If that is unavailable but preservation is
        supported, the resource remains opaque/lossless instead of being dropped.
        """
        resource = self.entity(resource_id)
        if resource["type"] != "resource":
            raise ReadError(f"entity is not a resource: {resource_id}")
        rep = self.choose_representation(resource_id, capabilities, mode="read")
        if rep is not None:
            return {
                "resourceId": resource_id,
                "status": "interpretable",
                "handling": "interpret",
                "plan": self.representation_plan(rep),
            }
        rep = self.choose_representation(resource_id, capabilities, mode="preserve")
        if rep is not None:
            return {
                "resourceId": resource_id,
                "status": "preservable",
                "handling": "preserve-opaque",
                "plan": self.representation_plan(rep),
            }
        return {
            "resourceId": resource_id,
            "status": "unsupported",
            "handling": "reject-or-lossy",
            "availableProfiles": [r.get("profile") for r in self._representation_candidates(resource_id)],
        }

    def import_plan(self, capabilities: CapabilitySet, entrypoint_id: str | None = None) -> dict[str, Any]:
        """Build a target-neutral LMS import plan.

        The plan deliberately contains portable IDs only. A concrete LMS adapter
        must allocate local IDs transactionally and record portableId -> localId.
        """
        root = entrypoint_id or self.primary_entrypoint()["id"]
        reachable: list[str] = []
        seen: set[str] = set()

        def walk(eid: str) -> None:
            if eid in seen:
                return
            seen.add(eid)
            reachable.append(eid)
            for child in self.entity(eid).get("children", []):
                walk(child)

        walk(root)
        structural=[]
        resource_ids=set()
        for eid in reachable:
            e=self.entity(eid)
            if e["type"] in {"course","unit","activity","objective"}:
                core={k:e[k] for k in ("id","type","title","description","revision","languages","role","activityType","children","resource","resources","objectives","extensions") if k in e}
                structural.append(core)
            if e.get("resource"):
                resource_ids.add(e["resource"])
            for rid in e.get("resources", []):
                resource_ids.add(rid)
        # Include unreferenced resources too. They may be dependencies needed for
        # lossless round-trip (for example CC/QTI shared media inventories).
        all_resources=[e["id"] for e in self.graph["entities"] if e["type"]=="resource"]
        resource_ids.update(all_resources)
        resources=[self.resource_import_plan(rid, capabilities) for rid in sorted(resource_ids)]
        unsupported=sum(1 for x in resources if x["status"]=="unsupported")
        preservable=sum(1 for x in resources if x["status"]=="preservable")
        interpretable=sum(1 for x in resources if x["status"]=="interpretable")
        report=self.transformation_report()
        return {
            "entrypoint": root,
            "portableIdMapRequired": True,
            "transactionRecommended": True,
            "structuralObjects": structural,
            "resources": resources,
            "summary": {
                "structuralObjects": len(structural),
                "resources": len(resources),
                "interpretable": interpretable,
                "preservableOpaque": preservable,
                "unsupported": unsupported,
            },
            "sourceRecovery": {
                "available": bool(report and report.get("source", {}).get("preservedPath")),
                "preservation": None if not report else report.get("source", {}).get("preservation"),
            },
        }

    def read_embedded_file(self, path: str, *, max_bytes: int = 64 * 1024 * 1024) -> bytes:
        _validate.safe_zip_name(path)
        with zipfile.ZipFile(self.path) as zf:
            try:
                info = zf.getinfo(path)
            except KeyError as exc:
                raise ReadError(f"embedded file not found: {path}") from exc
            if info.file_size > max_bytes:
                raise ReadError(f"embedded file exceeds read limit ({info.file_size} > {max_bytes})")
            return zf.read(info)

    def read_package_member(self, package_path: str, member: str, *, max_bytes: int = 64 * 1024 * 1024) -> bytes:
        """Read one member of a preserved nested ZIP without extracting it."""
        package_bytes = self.read_embedded_file(package_path, max_bytes=max_bytes * 4)
        _validate.safe_zip_name(member)
        import io
        try:
            with zipfile.ZipFile(io.BytesIO(package_bytes)) as nested:
                try:
                    info = nested.getinfo(member)
                except KeyError as exc:
                    raise ReadError(f"nested member not found: {member}") from exc
                if info.file_size > max_bytes:
                    raise ReadError(f"nested member exceeds read limit ({info.file_size} > {max_bytes})")
                if info.flag_bits & 0x1:
                    raise ReadError(f"encrypted nested member: {member}")
                return nested.read(info)
        except zipfile.BadZipFile as exc:
            raise ReadError(f"preserved payload is not a readable ZIP: {package_path}") from exc

    def transformation_report(self) -> dict[str, Any] | None:
        ext = (self.graph.get("extensions") or {}).get("org.p2rln.transform")
        if not ext:
            return None
        path = ext.get("report")
        if not path:
            return ext
        return json.loads(self.read_embedded_file(path).decode("utf-8"))
