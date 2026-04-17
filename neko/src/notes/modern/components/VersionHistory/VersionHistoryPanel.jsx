// VersionHistoryPanel.jsx - Google Docs style version history
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Loader,
  Radar,
  RotateCcw,
  Tag,
  Save,
  CircleX,
  Filter,
  Clock,
} from "lucide-react";
import { versionHistoryApi } from "../../../noteApi";
import { getUserColor } from "./utils/userColors";

// Import stock profile pictures
import catDP from "../../../../assets/dp/CAT.webp";
import dogDP from "../../../../assets/dp/DOG.webp";
import dolphinDP from "../../../../assets/dp/DOLPHIN.webp";
import dragonDP from "../../../../assets/dp/DRAGON.webp";
import elephantDP from "../../../../assets/dp/ELEPHANT.webp";
import foxDP from "../../../../assets/dp/FOX.webp";
import lionDP from "../../../../assets/dp/LION.webp";
import owlDP from "../../../../assets/dp/OWL.webp";
import penguinDP from "../../../../assets/dp/PENGUIN.webp";
import wolfDP from "../../../../assets/dp/WOLF.webp";

const profilePictureMap = {
  CAT: catDP,
  DOG: dogDP,
  DOLPHIN: dolphinDP,
  DRAGON: dragonDP,
  ELEPHANT: elephantDP,
  FOX: foxDP,
  LION: lionDP,
  OWL: owlDP,
  PENGUIN: penguinDP,
  WOLF: wolfDP,
};

// Helper function to get profile picture URL
const getProfilePicture = (profilePicId) => {
  if (!profilePicId) return null;

  // Check if it's a custom uploaded image (URL starts with https://)
  if (profilePicId.startsWith("https://")) {
    return profilePicId;
  }

  // Handle predefined avatars
  if (profilePictureMap[profilePicId]) {
    return profilePictureMap[profilePicId];
  }
  return null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isLikelyIdentifier = (value) => {
  if (value === undefined || value === null) return false;
  const stringValue = String(value).trim();
  if (!stringValue) return false;
  if (UUID_REGEX.test(stringValue)) return true;

  const hexLike = /^[0-9a-f-]+$/i.test(stringValue);
  if (hexLike && stringValue.replace(/-/g, "").length >= 16) {
    return true;
  }

  return false;
};

const DEFAULT_CONTRIBUTOR = { name: "Unknown User", profile_picture: "" };
const PREFETCH_CONTRIBUTOR_COUNT = 12;

const normalizeUser = (userLike) => {
  if (Array.isArray(userLike)) {
    for (const entry of userLike) {
      const normalized = normalizeUser(entry);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  if (!userLike) return null;

  if (typeof userLike === "string" || typeof userLike === "number") {
    const trimmed = String(userLike).trim();
    if (!trimmed) return null;
    return {
      id: null,
      name: trimmed,
      profile_picture: "",
      isFallbackName: isLikelyIdentifier(trimmed),
    };
  }

  if (typeof userLike !== "object") {
    return null;
  }

  const idCandidate =
    userLike.id ||
    userLike.user_id ||
    userLike.userId ||
    userLike.uid ||
    userLike.uuid ||
    userLike._id ||
    null;

  const firstName = userLike.first_name || userLike.firstName;
  const lastName = userLike.last_name || userLike.lastName;

  const potentialNames = [
    userLike.name,
    userLike.displayName,
    userLike.full_name,
    userLike.fullName,
    userLike.nickname,
    userLike.handle,
    userLike.username,
    userLike.user_name,
    [firstName, lastName].filter(Boolean).join(" ").trim(),
  ];

  if (userLike.email && typeof userLike.email === "string") {
    potentialNames.push(userLike.email.split("@")[0]);
  }

  let displayName = potentialNames.find(
    (value) => value && !isLikelyIdentifier(value)
  );

  if (!displayName) {
    displayName = potentialNames.find(Boolean) || null;
  }

  if (!displayName && idCandidate && !isLikelyIdentifier(idCandidate)) {
    displayName = idCandidate;
  }

  const profile_picture =
    userLike.profile_picture ||
    userLike.profilePicture ||
    userLike.profile_pic ||
    userLike.avatar ||
    userLike.avatar_url ||
    userLike.avatarUrl ||
    userLike.photo ||
    userLike.photo_url ||
    userLike.photoUrl ||
    userLike.image ||
    "";

  if (!displayName && !profile_picture && !idCandidate) {
    return null;
  }

  const normalizedName = displayName || idCandidate || "";
  if (!normalizedName && !profile_picture) {
    return null;
  }

  return {
    id: idCandidate || null,
    name: normalizedName,
    profile_picture: profile_picture || "",
    isFallbackName: !normalizedName || isLikelyIdentifier(normalizedName),
  };
};

const toDisplayContributor = (normalized) => {
  if (!normalized) return null;

  const name =
    normalized.name &&
    !normalized.isFallbackName &&
    !isLikelyIdentifier(normalized.name)
      ? normalized.name
      : DEFAULT_CONTRIBUTOR.name;

  const profile_picture = normalized.profile_picture || "";

  return {
    name,
    profile_picture,
  };
};

const mergeContributorIntoMap = (map, candidate) => {
  if (!candidate) return;

  if (Array.isArray(candidate)) {
    candidate.forEach((entry) => mergeContributorIntoMap(map, entry));
    return;
  }

  const normalized = normalizeUser(candidate);
  if (!normalized) return;

  const normalizedId = normalized.id || null;
  const normalizedNameLower = normalized.name
    ? normalized.name.trim().toLowerCase()
    : null;

  let key = normalizedId || normalized.name;
  if (!key) return;

  let existingKey = key;
  let existing = map.get(existingKey);

  if (!existing && normalizedId) {
    for (const [candidateKey, value] of map.entries()) {
      if (value && value.id && value.id === normalizedId) {
        existing = value;
        existingKey = candidateKey;
        break;
      }
    }
  }

  if (!existing && normalizedNameLower) {
    for (const [candidateKey, value] of map.entries()) {
      const valueNameLower = value?.name
        ? value.name.trim().toLowerCase()
        : null;
      if (valueNameLower && valueNameLower === normalizedNameLower) {
        existing = value;
        existingKey = candidateKey;
        break;
      }
    }
  }

  if (!existing) {
    map.set(key, normalized);
    return;
  }

  const merged = { ...existing };

  if (normalizedId && !merged.id) {
    merged.id = normalizedId;
  }

  const hasBetterName =
    normalized.name &&
    (!normalized.isFallbackName ||
      (existing.isFallbackName && !normalized.isFallbackName));

  if (hasBetterName || (!merged.name && normalized.name)) {
    merged.name = normalized.name;
    merged.isFallbackName = normalized.isFallbackName;
  }

  if (!merged.profile_picture && normalized.profile_picture) {
    merged.profile_picture = normalized.profile_picture;
  }

  const targetKey = merged.id || normalizedId || existingKey;
  if (targetKey !== existingKey) {
    map.delete(existingKey);
    existingKey = targetKey;
  }

  const existingTarget = map.get(existingKey);
  if (existingTarget && existingTarget !== merged) {
    const combined = { ...existingTarget };
    if (!combined.profile_picture && merged.profile_picture) {
      combined.profile_picture = merged.profile_picture;
    }
    if (
      (combined.isFallbackName && !merged.isFallbackName && merged.name) ||
      (!combined.name && merged.name)
    ) {
      combined.name = merged.name;
      combined.isFallbackName = merged.isFallbackName;
    }
    combined.id = merged.id || combined.id || null;
    map.set(existingKey, combined);
  } else {
    merged.id = merged.id || normalizedId || merged.id || null;
    map.set(existingKey, merged);
  }
};

const finalizeContributors = (map) => {
  if (!map || map.size === 0) {
    return [DEFAULT_CONTRIBUTOR];
  }

  const results = [];

  map.forEach((normalized) => {
    const display = toDisplayContributor(normalized);
    if (!display) return;

    if (
      display.name === DEFAULT_CONTRIBUTOR.name &&
      display.profile_picture === "" &&
      results.some(
        (existing) =>
          existing.name === display.name &&
          existing.profile_picture === display.profile_picture
      )
    ) {
      return;
    }

    results.push(display);
  });

  return results.length > 0 ? results : [DEFAULT_CONTRIBUTOR];
};

const parseVersionMetadata = (metadata) => {
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch (error) {
      console.debug(
        "[VersionHistoryPanel] Failed to parse version metadata",
        error
      );
    }
  }

  return {};
};

const collectContributorsForDisplay = (versionLike) => {
  if (!versionLike) {
    return [DEFAULT_CONTRIBUTOR];
  }

  const contributorMap = new Map();
  const metadata = parseVersionMetadata(versionLike.metadata);

  mergeContributorIntoMap(contributorMap, versionLike.allContributors);
  mergeContributorIntoMap(contributorMap, versionLike.contributors);
  mergeContributorIntoMap(contributorMap, metadata?.contributors);
  mergeContributorIntoMap(contributorMap, metadata?.collaborators);
  mergeContributorIntoMap(contributorMap, metadata?.editors);
  mergeContributorIntoMap(contributorMap, metadata?.checkpoint_creator);
  mergeContributorIntoMap(contributorMap, metadata?.creator);
  mergeContributorIntoMap(contributorMap, metadata?.createdBy);
  mergeContributorIntoMap(contributorMap, metadata?.lastEditedBy);
  mergeContributorIntoMap(contributorMap, versionLike.users);
  mergeContributorIntoMap(contributorMap, versionLike.user);
  mergeContributorIntoMap(contributorMap, versionLike.actors);
  mergeContributorIntoMap(contributorMap, versionLike.actor);
  mergeContributorIntoMap(contributorMap, versionLike.collaborators);
  mergeContributorIntoMap(contributorMap, versionLike.editors);
  mergeContributorIntoMap(contributorMap, versionLike.updated_by);
  mergeContributorIntoMap(contributorMap, versionLike.created_by);
  mergeContributorIntoMap(contributorMap, versionLike.user_name);
  mergeContributorIntoMap(contributorMap, versionLike.username);

  const contributors = finalizeContributors(contributorMap);
  const filtered = contributors.filter(
    (contributor) => contributor.name !== DEFAULT_CONTRIBUTOR.name
  );
  return filtered.length > 0 ? filtered : contributors;
};

const getOperationTimestamp = (operation, indexFallback = 0) => {
  const rawTimestamp =
    operation?.created_at ||
    operation?.createdAt ||
    operation?.updated_at ||
    operation?.performed_at ||
    operation?.timestamp ||
    null;

  if (rawTimestamp) {
    const parsed = new Date(rawTimestamp).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return indexFallback;
};

const extractBlockIdsFromOperation = (operation) => {
  const ids = new Set();
  const pushId = (value) => {
    if (value === null || value === undefined) return;
    const id = String(value).trim();
    if (id) {
      ids.add(id);
    }
  };

  pushId(operation?.block_id);
  pushId(operation?.blockId);
  pushId(operation?.blockID);
  pushId(operation?.target_block_id);
  pushId(operation?.targetBlockId);

  const candidateSources = [
    operation?.metadata?.operation_data,
    operation?.metadata?.operationData,
    operation?.operation_data,
    operation?.operationData,
    operation?.data,
    operation?.payload,
  ];

  candidateSources.forEach((source) => {
    if (!source) return;

    if (Array.isArray(source)) {
      source.forEach((entry) => {
        if (entry && typeof entry === "object") {
          pushId(entry.blockId || entry.block_id || entry.id);
        } else {
          pushId(entry);
        }
      });
      return;
    }

    pushId(source.blockId);
    pushId(source.block_id);
    pushId(source.id);

    if (Array.isArray(source.blockIds)) {
      source.blockIds.forEach(pushId);
    }
    if (Array.isArray(source.block_ids)) {
      source.block_ids.forEach(pushId);
    }
    if (Array.isArray(source.blocks)) {
      source.blocks.forEach((block) =>
        pushId(block?.id || block?.blockId || block?.block_id)
      );
    }
    if (Array.isArray(source.affectedBlocks)) {
      source.affectedBlocks.forEach(pushId);
    }
    if (Array.isArray(source.affectedBlockIds)) {
      source.affectedBlockIds.forEach(pushId);
    }
    if (Array.isArray(source.blockChanges)) {
      source.blockChanges.forEach((change) =>
        pushId(change?.blockId || change?.block_id)
      );
    }
  });

  return Array.from(ids);
};

const buildBlockOperationUserMap = (operations = []) => {
  const blockMap = new Map();

  operations.forEach((operation, index) => {
    const blockIds = extractBlockIdsFromOperation(operation);
    if (blockIds.length === 0) return;

    const operationUser =
      normalizeUser(operation?.users) ||
      normalizeUser(operation?.user) ||
      normalizeUser(operation?.actor) ||
      normalizeUser(operation?.performed_by) ||
      normalizeUser(operation?.created_by) ||
      normalizeUser({
        id:
          operation?.user_id ||
          operation?.userId ||
          operation?.actor_id ||
          operation?.actorId ||
          operation?.created_by,
        name:
          operation?.user_name ||
          operation?.username ||
          operation?.user ||
          operation?.performed_by ||
          operation?.created_by ||
          "",
        profile_picture:
          operation?.user_profile_picture ||
          operation?.users?.profile_picture ||
          operation?.actor?.profile_picture ||
          operation?.profile_picture ||
          "",
      });

    const timestamp = getOperationTimestamp(operation, index);

    blockIds.forEach((blockId) => {
      const entry = blockMap.get(blockId) || {
        contributors: new Map(),
        primary: null,
        primaryTimestamp: -Infinity,
      };

      if (operationUser) {
        const contributorKey =
          operationUser.id ||
          operationUser.name ||
          `${operationUser.profile_picture || ""}:${timestamp}`;
        const existingContributor = entry.contributors.get(contributorKey);

        if (
          !existingContributor ||
          timestamp >= existingContributor.timestamp ||
          (existingContributor.normalized.isFallbackName &&
            operationUser &&
            !operationUser.isFallbackName)
        ) {
          entry.contributors.set(contributorKey, {
            normalized: operationUser,
            display: toDisplayContributor(operationUser),
            timestamp,
          });
        }

        const shouldReplacePrimary =
          !entry.primary ||
          timestamp >= entry.primaryTimestamp ||
          (entry.primary.normalized?.isFallbackName &&
            operationUser &&
            !operationUser.isFallbackName);

        if (shouldReplacePrimary) {
          entry.primary = {
            normalized: operationUser,
            display: toDisplayContributor(operationUser),
          };
          entry.primaryTimestamp = timestamp;
        }
      }

      blockMap.set(blockId, entry);
    });
  });

  return new Map(
    Array.from(blockMap.entries()).map(([blockId, entry]) => {
      const contributorsSorted = Array.from(entry.contributors.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((record) => record.display)
        .filter(Boolean);

      const uniqueContributors = [];
      const seen = new Set();
      contributorsSorted.forEach((contributor) => {
        const key = `${contributor.name}|${contributor.profile_picture || ""}`;
        if (seen.has(key)) return;
        seen.add(key);
        uniqueContributors.push(contributor);
      });

      const primaryContributor =
        entry.primary?.display ||
        uniqueContributors[uniqueContributors.length - 1] ||
        null;

      return [
        blockId,
        {
          contributors: uniqueContributors,
          primary: primaryContributor,
        },
      ];
    })
  );
};

const applyOperationMetadataToBlock = (
  block,
  baseUser,
  operationEntry = null
) => {
  const existingUpdatedBy = block?.updated_by;
  const existingProfilePicture = block?.user_profile_picture;

  const inferredContributors = Array.isArray(block?.__contributors)
    ? [...block.__contributors]
    : [];

  const operationContributors = Array.isArray(operationEntry?.contributors)
    ? operationEntry.contributors
    : [];

  operationContributors.forEach((contributor) => {
    if (!contributor?.name) return;
    const key = `${contributor.name}|${contributor.profile_picture || ""}`;
    if (
      !inferredContributors.some(
        (existing) =>
          `${existing.name}|${existing.profile_picture || ""}` === key
      )
    ) {
      inferredContributors.push(contributor);
    }
  });

  if (
    baseUser?.name &&
    baseUser.name !== DEFAULT_CONTRIBUTOR.name &&
    !inferredContributors.some(
      (contributor) => contributor.name === baseUser.name
    )
  ) {
    inferredContributors.push(baseUser);
  }

  if (inferredContributors.length === 0) {
    inferredContributors.push(DEFAULT_CONTRIBUTOR);
  }

  const primaryContributor = operationEntry?.primary || null;
  const preferredContributor =
    (primaryContributor &&
      primaryContributor.name &&
      primaryContributor.name !== DEFAULT_CONTRIBUTOR.name &&
      primaryContributor) ||
    inferredContributors.find(
      (contributor) => contributor.name !== DEFAULT_CONTRIBUTOR.name
    ) ||
    inferredContributors[inferredContributors.length - 1];

  const updatedByValue =
    preferredContributor?.name ||
    existingUpdatedBy ||
    baseUser?.name ||
    DEFAULT_CONTRIBUTOR.name;

  const updatedProfilePicture =
    existingProfilePicture ||
    preferredContributor?.profile_picture ||
    baseUser?.profile_picture ||
    "";

  return {
    ...block,
    updated_by: updatedByValue,
    created_by: block?.created_by || baseUser?.name || DEFAULT_CONTRIBUTOR.name,
    user_profile_picture: updatedProfilePicture,
    __contributors: inferredContributors,
  };
};

const getFallbackUserFromVersion = (versionLike) => {
  const contributors = collectContributorsForDisplay(versionLike);
  return contributors.length > 0 ? contributors[0] : null;
};

const getBlocksFromVersionData = (versionData) => {
  if (!versionData) return [];

  if (Array.isArray(versionData.blocks)) {
    return versionData.blocks;
  }

  if (
    typeof versionData.blocks === "object" &&
    Array.isArray(versionData.blocks?.blocks)
  ) {
    return versionData.blocks.blocks;
  }

  return [];
};

const VersionHistoryPanel = ({
  noteId,
  isOpen,
  onVersionRestore,
  onShowDiff, // Callback to show diff in editor area
  headerHeight = 96,
  availableHeight = null,
  restoringVersionId = null, // Shared restoring state from parent
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [expandedTimeGroups, setExpandedTimeGroups] = useState(new Set());
  const [showMenu, setShowMenu] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [editingVersionId, setEditingVersionId] = useState(null);
  const [editingVersionName, setEditingVersionName] = useState("");
  const [editingGroupKey, setEditingGroupKey] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [groupNames, setGroupNames] = useState({}); // Store custom names for time groups
  const [showOnlyNamed, setShowOnlyNamed] = useState(false);

  const versionDetailsCacheRef = useRef();
  if (!versionDetailsCacheRef.current) {
    versionDetailsCacheRef.current = new Map();
  }
  const activeFetchTokenRef = useRef(0);

  useEffect(() => {
    if (versionDetailsCacheRef.current) {
      versionDetailsCacheRef.current.clear();
    }
    activeFetchTokenRef.current += 1;
  }, [noteId]);

  const getVersionDetails = useCallback(
    async (versionSummary) => {
      if (!noteId || !versionSummary) return null;

      const cache = versionDetailsCacheRef.current;
      if (cache?.has(versionSummary.id)) {
        return cache.get(versionSummary.id);
      }

      try {
        const fetched = await versionHistoryApi.getVersion(
          noteId,
          versionSummary.id
        );
        if (!fetched) {
          return null;
        }

        const parsed =
          typeof fetched === "object"
            ? { ...fetched, metadata: parseVersionMetadata(fetched.metadata) }
            : fetched;

        if (cache && parsed) {
          cache.set(versionSummary.id, parsed);
        }

        return parsed;
      } catch (error) {
        console.error(
          `Failed to load version details for ${versionSummary.id}:`,
          error
        );
        throw error;
      }
    },
    [noteId]
  );

  // Load group names from backend for this specific note
  const loadGroupNames = useCallback(async () => {
    if (!noteId) return;

    try {
      const names = await versionHistoryApi.getGroupNames(noteId);
      setGroupNames(names || {});
    } catch (error) {
      console.error("Failed to load group names from backend:", error);
      // Fallback to localStorage if backend fails
      try {
        const storageKey = `version-group-names-${noteId}`;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          setGroupNames(parsed);
        }
      } catch (localError) {
        console.error("Failed to load from localStorage:", localError);
      }
    }
  }, [noteId]);

  // Load group names when component mounts or noteId changes
  useEffect(() => {
    if (isOpen && noteId) {
      loadGroupNames();
    }
  }, [isOpen, noteId, loadGroupNames]);

  // Helper function to extract all unique users from a version's blocks and operations
  const extractAllUsersFromVersion = useCallback(
    async (noteIdentifier, versionSummary, versionData, preloadedOperations) => {
      if (!versionData && !preloadedOperations) {
        return collectContributorsForDisplay(versionSummary);
      }

      const contributorMap = new Map();
      const add = (candidate) => mergeContributorIntoMap(contributorMap, candidate);

      collectContributorsForDisplay(versionSummary).forEach(add);
      collectContributorsForDisplay(versionData).forEach(add);

      const blocks = getBlocksFromVersionData(versionData);
      blocks.forEach((block) => {
        add({
          id:
            block.user_id ||
            block.userId ||
            block.updated_by_id ||
            block.created_by_id ||
            block.user?.id ||
            null,
          name: block.updated_by || block.created_by || block.user?.name || "",
          profile_picture:
            block.user_profile_picture ||
            block.updated_by_profile_picture ||
            block.created_by_profile_picture ||
            block.user?.profile_picture ||
            "",
        });
        add(block.user);
      });

      add(getFallbackUserFromVersion(versionData));
      add(getFallbackUserFromVersion(versionSummary));

      let operationsToProcess = preloadedOperations;
      if (!operationsToProcess) {
        try {
          operationsToProcess = await versionHistoryApi.getOperations(
            noteIdentifier,
            {
              versionId: versionSummary?.id,
              limit: 200,
            }
          );
        } catch (error) {
          console.error(
            "Failed to fetch operations for user extraction:",
            error
          );
          operationsToProcess = [];
        }
      }

      if (Array.isArray(operationsToProcess)) {
        operationsToProcess.forEach((op) => {
          if (!op) return;

          add(op.users);
          add(op.user);
          add(op.actor);
          add(op.actors);
          add(op.collaborators);
          add({
            id:
              op.user_id ||
              op.userId ||
              op.users?.id ||
              op.actor?.id ||
              null,
            name:
              op.users?.name ||
              op.user_name ||
              op.username ||
              op.user ||
              op.actor?.name ||
              op.actor ||
              op.performed_by ||
              op.created_by ||
              "",
            profile_picture:
              op.users?.profile_picture ||
              op.user_profile_picture ||
              op.user?.profile_picture ||
              op.actor?.profile_picture ||
              op.profile_picture ||
              "",
          });
        });
      }

      const contributors = finalizeContributors(contributorMap);
      const filteredContributors = contributors.filter(
        (contributor) => contributor.name !== DEFAULT_CONTRIBUTOR.name
      );
      const finalContributors =
        filteredContributors.length > 0 ? filteredContributors : contributors;
      console.debug(
        `[Version ${versionSummary?.id}] contributors resolved:`,
        finalContributors
      );
      return finalContributors;
    },
    []
  );

  const prefetchContributors = useCallback(
    (versionsToFetch, fetchToken) => {
      if (!noteId || !Array.isArray(versionsToFetch) || versionsToFetch.length === 0) {
        return;
      }

      const run = async () => {
        for (const version of versionsToFetch) {
          if (activeFetchTokenRef.current !== fetchToken) {
            return;
          }

          if (!version || version.contributorsLoaded) {
            continue;
          }

          try {
            const versionDetails = await getVersionDetails(version);
            const contributors = await extractAllUsersFromVersion(
              noteId,
              version,
              versionDetails
            );

            if (activeFetchTokenRef.current !== fetchToken) {
              return;
            }

            setVersions((prev) =>
              prev.map((entry) =>
                entry.id === version.id
                  ? {
                      ...entry,
                      allContributors:
                        contributors && contributors.length
                          ? contributors
                          : entry.allContributors.length
                          ? entry.allContributors
                          : [DEFAULT_CONTRIBUTOR],
                      contributorsLoaded: true,
                    }
                  : entry
              )
            );
          } catch (error) {
            console.error(
              `Failed to prefetch contributors for version ${version?.id}:`,
              error
            );
            setVersions((prev) =>
              prev.map((entry) =>
                entry.id === version?.id
                  ? { ...entry, contributorsLoaded: true }
                  : entry
              )
            );
          }
        }
      };

      run();
    },
    [noteId, getVersionDetails, extractAllUsersFromVersion]
  );

  const loadVersions = useCallback(async () => {
    if (!noteId) return;

    setLoading(true);
    const fetchToken = activeFetchTokenRef.current + 1;
    activeFetchTokenRef.current = fetchToken;

    try {
      const { versions: versionData = [] } =
        (await versionHistoryApi.getVersionHistory(noteId, {
          limit: 100,
          includeOperations: false,
        })) || {};

      const normalizedVersions = versionData.map((version) => {
        const metadata = parseVersionMetadata(version.metadata);
        const baseContributor = getFallbackUserFromVersion({
          ...version,
          metadata,
        });

        return {
          ...version,
          metadata,
          allContributors: baseContributor ? [baseContributor] : [],
          contributorsLoaded: false,
        };
      });

      setVersions(normalizedVersions);

      if (normalizedVersions.length > 0) {
        const currentVersion = normalizedVersions[0];
        setSelectedVersionId(currentVersion.id);

        const allMonths = [
          ...new Set(
            normalizedVersions.map((v) => getMonthKey(v.created_at))
          ),
        ];
        setExpandedMonths(new Set(allMonths));
        setExpandedTimeGroups(new Set());
      } else {
        setSelectedVersionId(null);
        setExpandedMonths(new Set());
        setExpandedTimeGroups(new Set());
      }

      prefetchContributors(
        normalizedVersions.slice(0, PREFETCH_CONTRIBUTOR_COUNT),
        fetchToken
      );
    } catch (error) {
      console.error("Failed to load versions:", error);
      setVersions([]);
      setSelectedVersionId(null);
      setExpandedMonths(new Set());
      setExpandedTimeGroups(new Set());
    } finally {
      setLoading(false);
    }
  }, [noteId, prefetchContributors]);

  useEffect(() => {
    if (isOpen && noteId) {
      loadVersions();
    }
  }, [isOpen, noteId, loadVersions]);

  // Listen for version creation events to auto-refresh
  useEffect(() => {
    if (!isOpen || !noteId) return;

    const handleVersionCreated = (event) => {
      // Check if the event is for this note
      if (event.detail?.noteId === noteId) {
        console.log(
          "[VersionHistoryPanel] New version created, refreshing list..."
        );
        loadVersions();
      }
    };

    window.addEventListener("version-created", handleVersionCreated);

    return () => {
      window.removeEventListener("version-created", handleVersionCreated);
    };
  }, [isOpen, noteId, loadVersions]);

  // Handle version click to show diff viewer

  const handleVersionClick = async (version, index) => {
    try {
      // Set this version as selected
      setSelectedVersionId(version.id);

      // Extract blocks from version data and attach user information
      const getBlocks = (data, versionInfo, operationUsersMap) => {
        if (!data) return [];

        const blocks = getBlocksFromVersionData(data);
        const baseUser =
          getFallbackUserFromVersion(versionInfo) || DEFAULT_CONTRIBUTOR;

        return blocks.map((block) => {
          const operationEntry = operationUsersMap?.get(String(block?.id));

          return applyOperationMetadataToBlock(
            {
              ...block,
              updated_by: block?.updated_by || baseUser.name,
              created_by: block?.created_by || baseUser.name,
              user_profile_picture:
                block?.user_profile_picture ||
                block?.updated_by_profile_picture ||
                block?.created_by_profile_picture ||
                baseUser.profile_picture,
            },
            baseUser,
            operationEntry
          );
        });
      };
      const versionUser =
        getFallbackUserFromVersion(version) || DEFAULT_CONTRIBUTOR;
      const versionUserName = versionUser.name || "Unknown User";
      const versionUserProfilePicture = versionUser.profile_picture || "";

      // Show loading state immediately
      const pendingTitle = version?.title || version?.name || "";

      if (onShowDiff) {
        onShowDiff({
          oldBlocks: [],
          newBlocks: [],
          oldTitle: "",
          newTitle: pendingTitle,
          versionId: version.id,
          versionData: null,
          versionUser: {
            name: versionUserName,
            profilePicture: versionUserProfilePicture,
          },
          isLoading: true,
          onClose: () => onShowDiff(null),
        });
      }

      // Fetch version data in parallel (with memoised cache)
      const currentVersionPromise = getVersionDetails(version);

      // Compare with previous version
      let oldBlocks = [];
      let oldTitle = "";
      const nextVersion =
        index < versions.length - 1 ? versions[index + 1] : null;
      const previousVersionPromise = nextVersion
        ? getVersionDetails(nextVersion)
        : null;

      const operationsPromise = versionHistoryApi
        .getOperations(noteId, {
          versionId: version.id,
          limit: 200,
        })
        .catch((error) => {
          console.error("Failed to load operations for version:", error);
          return [];
        });

      const versionData = await currentVersionPromise;
      const previousVersion = previousVersionPromise
        ? await previousVersionPromise
        : null;
      const operationsRaw = await operationsPromise;
      const operations = Array.isArray(operationsRaw) ? operationsRaw : [];

      const operationUsersMap = buildBlockOperationUserMap(operations);

      const newBlocks = getBlocks(versionData, version, operationUsersMap);
      const newTitle = versionData?.title || "";

      if (previousVersion) {
        const previousVersionInfo = nextVersion;
        oldBlocks = getBlocks(
          previousVersion,
          previousVersionInfo,
          operationUsersMap
        );
        oldTitle = previousVersion?.title || "";
      }

      // Update contributor list with freshest data
      try {
        const contributors = await extractAllUsersFromVersion(
          noteId,
          version,
          versionData,
          operations
        );

        setVersions((prev) =>
          prev.map((entry) =>
            entry.id === version.id
              ? {
                  ...entry,
                  allContributors:
                    contributors && contributors.length
                      ? contributors
                      : entry.allContributors.length
                      ? entry.allContributors
                      : [versionUser],
                  contributorsLoaded: true,
                }
              : entry
          )
        );
      } catch (error) {
        console.error(
          `Failed to refresh contributors for version ${version.id}:`,
          error
        );
        setVersions((prev) =>
          prev.map((entry) =>
            entry.id === version.id
              ? {
                  ...entry,
                  contributorsLoaded: true,
                  allContributors: entry.allContributors.length
                    ? entry.allContributors
                    : [versionUser],
                }
              : entry
          )
        );
      }

      // Call parent to show diff in editor area
      if (onShowDiff) {
        onShowDiff({
          oldBlocks,
          newBlocks,
          oldTitle,
          newTitle,
          versionId: version.id,
          versionData: {
            title: newTitle,
            content: newBlocks,
            versionNumber: version.version_number,
            operations, // Pass operations to diff viewer
          },
          versionUser: {
            name: versionUserName,
            profilePicture: versionUserProfilePicture,
          },
          isLoading: false,
          onClose: () => onShowDiff(null),
        });
      }
    } catch (error) {
      console.error("Failed to load version for diff:", error);
      if (onShowDiff) {
        onShowDiff(null);
      }
    }
  };

  const formatDateTime = (date) => {
    const versionDate = new Date(date);
    const time = versionDate.toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const dateStr = versionDate.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });

    return `${dateStr}, ${time}`;
  };

  const getMonthKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  const getMonthLabel = (date) => {
    return new Date(date).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  const toggleMonth = (monthKey) => {
    setExpandedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  };

  const toggleTimeGroup = (groupKey) => {
    setExpandedTimeGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const handleStartEditingVersionName = (version) => {
    setEditingVersionId(version.id);
    // Get existing name from metadata or use empty string
    const currentName = version.metadata?.checkpoint_name || "";
    setEditingVersionName(currentName);
  };

  const handleSaveVersionName = async (versionId) => {
    if (!editingVersionName.trim()) {
      setEditingVersionId(null);
      setEditingVersionName("");
      return;
    }

    try {
      await versionHistoryApi.updateVersionName(
        noteId,
        versionId,
        editingVersionName.trim()
      );
      setEditingVersionId(null);
      setEditingVersionName("");
      // Refresh version list to show updated name
      loadVersions();
    } catch (error) {
      console.error("Failed to update version name:", error);
    }
  };

  const handleCancelEditingVersionName = () => {
    setEditingVersionId(null);
    setEditingVersionName("");
  };

  const handleStartEditingGroupName = (groupKey, currentName = "") => {
    setEditingGroupKey(groupKey);
    setEditingGroupName(currentName);
  };

  const handleSaveGroupName = async (groupKey) => {
    try {
      if (!editingGroupName.trim()) {
        // Remove the group name if empty
        await versionHistoryApi.deleteGroupName(noteId, groupKey);
        setGroupNames((prev) => {
          const newNames = { ...prev };
          delete newNames[groupKey];
          return newNames;
        });
      } else {
        // Save the group name to backend
        await versionHistoryApi.updateGroupName(
          noteId,
          groupKey,
          editingGroupName.trim()
        );
        setGroupNames((prev) => ({
          ...prev,
          [groupKey]: editingGroupName.trim(),
        }));

        // Also save to localStorage as backup
        try {
          const storageKey = `version-group-names-${noteId}`;
          const updated = {
            ...groupNames,
            [groupKey]: editingGroupName.trim(),
          };
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (error) {
          console.error("Failed to save to localStorage backup:", error);
        }
      }

      // Reload group names from backend to ensure consistency
      await loadGroupNames();
    } catch (error) {
      console.error("Failed to save group name:", error);
      // Fallback to localStorage only if backend fails
      if (!editingGroupName.trim()) {
        setGroupNames((prev) => {
          const newNames = { ...prev };
          delete newNames[groupKey];
          return newNames;
        });
      } else {
        setGroupNames((prev) => ({
          ...prev,
          [groupKey]: editingGroupName.trim(),
        }));
      }
    } finally {
      setEditingGroupKey(null);
      setEditingGroupName("");
    }
  };

  const handleCancelEditingGroupName = () => {
    setEditingGroupKey(null);
    setEditingGroupName("");
  };

  // Keyboard navigation through versions
  useEffect(() => {
    if (!isOpen || editingVersionId || editingGroupKey) return;

    const handleKeyDown = (e) => {
      // Don't handle arrow keys if user is editing a version or group name
      if (editingVersionId || editingGroupKey) return;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();

        const currentIndex = versions.findIndex(
          (v) => v.id === selectedVersionId
        );

        let newIndex;
        if (e.key === "ArrowUp") {
          // Move to previous version (can go to 0, which is the current version)
          newIndex = Math.max(0, currentIndex - 1);
        } else {
          // Move to next version
          newIndex = Math.min(versions.length - 1, currentIndex + 1);
        }

        // Only proceed if we actually moved to a different version
        if (newIndex === currentIndex) return;

        const newVersion = versions[newIndex];
        if (newVersion) {
          // Group versions by month first
          const monthVersionsMap = versions.reduce((acc, v) => {
            const mk = getMonthKey(v.created_at);
            if (!acc[mk]) acc[mk] = [];
            acc[mk].push(v);
            return acc;
          }, {});

          // Auto-expand the month containing this version
          const monthKey = getMonthKey(newVersion.created_at);
          setExpandedMonths((prev) => new Set([...prev, monthKey]));

          // Auto-expand the time group containing this version
          const monthVersions = monthVersionsMap[monthKey] || [];
          const timeGroups = groupVersionsByTime(monthVersions);

          timeGroups.forEach((timeGroup) => {
            if (timeGroup.some((v) => v.id === newVersion.id)) {
              const firstVersionTimestamp = new Date(
                timeGroup[0].created_at
              ).getTime();
              const groupKey = `${monthKey}-group-${firstVersionTimestamp}`;
              setExpandedTimeGroups((prev) => new Set([...prev, groupKey]));
            }
          });

          // Update selection and trigger diff view
          handleVersionClick(newVersion, newIndex);

          // Scroll the selected version into view after a short delay to allow DOM updates
          setTimeout(() => {
            const versionElements =
              document.querySelectorAll("[data-version-id]");
            const selectedElement = Array.from(versionElements).find(
              (el) => el.getAttribute("data-version-id") === newVersion.id
            );

            if (selectedElement) {
              selectedElement.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
              });
            }
          }, 100);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    versions,
    selectedVersionId,
    editingVersionId,
    editingGroupKey,
    handleVersionClick,
  ]);

  // Group versions within a month by time proximity (within 5 minutes)
  const groupVersionsByTime = (monthVersions) => {
    const TIME_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
    const groups = [];
    let currentGroup = [];

    monthVersions.forEach((version, index) => {
      if (currentGroup.length === 0) {
        currentGroup.push(version);
      } else {
        const lastVersion = currentGroup[currentGroup.length - 1];
        const timeDiff =
          new Date(lastVersion.created_at) - new Date(version.created_at);

        if (timeDiff <= TIME_THRESHOLD) {
          // Add to current group
          currentGroup.push(version);
        } else {
          // Start new group
          groups.push([...currentGroup]);
          currentGroup = [version];
        }
      }

      // Push the last group
      if (index === monthVersions.length - 1) {
        groups.push([...currentGroup]);
      }
    });

    return groups;
  };

  // Filter versions based on showOnlyNamed toggle
  // When showOnlyNamed is true, we need to filter at the group level after grouping
  // to check if either the version itself is named OR the group it belongs to is named
  const filteredVersions = versions;

  // Group versions by month
  const groupedVersions = filteredVersions.reduce((acc, version) => {
    const monthKey = getMonthKey(version.created_at);
    if (!acc[monthKey]) {
      acc[monthKey] = {
        label: getMonthLabel(version.created_at),
        versions: [],
      };
    }
    acc[monthKey].versions.push(version);
    return acc;
  }, {});

  // Apply named filter after grouping to check both version names and group names
  const getFilteredGroupedVersions = () => {
    if (!showOnlyNamed) {
      return groupedVersions;
    }

    const filtered = {};
    Object.entries(groupedVersions).forEach(([monthKey, group]) => {
      const timeGroups = groupVersionsByTime(group.versions);
      const filteredVersions = [];

      timeGroups.forEach((timeGroup, groupIdx) => {
        const groupKey = `${monthKey}-group-${groupIdx}`;
        const hasNamedGroup = groupNames[groupKey];
        const namedVersionsInGroup = timeGroup.filter(
          (v) => v.metadata?.checkpoint_name
        );

        // Include the entire group if:
        // 1. The group itself has a custom name, OR
        // 2. Any version in the group has a custom name
        if (hasNamedGroup || namedVersionsInGroup.length > 0) {
          filteredVersions.push(...timeGroup);
        }
      });

      if (filteredVersions.length > 0) {
        filtered[monthKey] = {
          label: group.label,
          versions: filteredVersions,
        };
      }
    });

    return filtered;
  };

  const displayGroupedVersions = getFilteredGroupedVersions();

  return (
    <>
      <div
        className="bg-gray-50 dark:bg-gray-800 midnight:bg-[#0f1419] border-l border-gray-200 dark:border-gray-700 midnight:border-gray-600 shadow-lg flex flex-col h-full"
        style={{
          width: isOpen ? "320px" : "0px",
          minWidth: isOpen ? "320px" : "0px",
          overflow: "hidden",
          transition: "all 350ms cubic-bezier(0.4, 0.0, 0.2, 1)",
        }}
      >
        {/* Inner content wrapper for smooth reveal */}
        <div
          className="w-80 h-full flex flex-col"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? "translateX(0)" : "translateX(20px)",
            transition: isOpen
              ? "opacity 300ms cubic-bezier(0.4, 0.0, 0.2, 1) 50ms, transform 350ms cubic-bezier(0.4, 0.0, 0.2, 1)"
              : "opacity 200ms cubic-bezier(0.4, 0.0, 0.2, 1), transform 350ms cubic-bezier(0.4, 0.0, 0.2, 1)",
            pointerEvents: isOpen ? "auto" : "none",
          }}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 midnight:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400 midnight:text-gray-400" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 midnight:text-gray-200">
                  Version History
                </h3>
              </div>
              {/* Filter Toggle Button */}
              <button
                onClick={() => setShowOnlyNamed(!showOnlyNamed)}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors ${
                  showOnlyNamed
                    ? "bg-blue-100 dark:bg-blue-900/30 midnight:bg-blue-900/40 text-blue-700 dark:text-blue-400 midnight:text-blue-400"
                    : "bg-gray-100 dark:bg-gray-700 midnight:bg-gray-700 text-gray-600 dark:text-gray-400 midnight:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 midnight:hover:bg-gray-600"
                }`}
                title={
                  showOnlyNamed
                    ? "Showing Named Versions"
                    : "Showing All Versions"
                }
              >
                <Filter className="w-3 h-3" />
                <span>Named Versions</span>
              </button>
            </div>
          </div>

          {/* Version List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 flex flex-col items-center justify-center gap-3">
                <Loader className="w-8 h-8 text-blue-500 dark:text-blue-400 midnight:text-blue-400 animate-spin" />
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  Loading Versions...
                </div>
              </div>
            ) : versions.length === 0 ? (
              <div className="p-4 flex flex-col items-center justify-center gap-3">
                <Radar className="w-8 h-8 text-gray-400 dark:text-gray-500 midnight:text-gray-500" />
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  No Version History Available
                </div>
              </div>
            ) : (
              <div>
                {Object.entries(displayGroupedVersions).map(
                  ([monthKey, group]) => (
                    <div key={monthKey}>
                      {/* Month header */}
                      <div
                        className="flex items-center gap-1 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800/50"
                        onClick={() => toggleMonth(monthKey)}
                      >
                        {expandedMonths.has(monthKey) ? (
                          <ChevronDown className="w-4 h-4 text-gray-500 midnight:text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500 midnight:text-gray-400" />
                        )}
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
                          {group.label}
                        </span>
                      </div>

                      {/* Versions in this month */}
                      {expandedMonths.has(monthKey) && (
                        <div>
                          {groupVersionsByTime(group.versions).map(
                            (timeGroup, groupIdx) => {
                              // Generate stable groupKey based on first version's timestamp
                              // This ensures the key remains consistent even when filtering
                              const firstVersionTimestamp = new Date(
                                timeGroup[0].created_at
                              ).getTime();
                              const groupKey = `${monthKey}-group-${firstVersionTimestamp}`;
                              const isGroupExpanded =
                                expandedTimeGroups.has(groupKey);

                              // If only one version in group, render it directly without grouping
                              if (timeGroup.length === 1) {
                                const version = timeGroup[0];
                                const globalIndex = versions.findIndex(
                                  (v) => v.id === version.id
                                );
                                const isFirst = globalIndex === 0;
                                const contributorsForVersion =
                                  Array.isArray(version.allContributors) &&
                                  version.allContributors.length > 0
                                    ? version.allContributors
                                    : collectContributorsForDisplay(version);

                                return (
                                  <div
                                    key={version.id}
                                    className="relative group"
                                    data-version-id={version.id}
                                  >
                                    <div
                                      className={`px-4 py-2 cursor-pointer flex items-start justify-between ${
                                        selectedVersionId === version.id
                                          ? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30"
                                          : "hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800/50"
                                      }`}
                                      onClick={() =>
                                        handleVersionClick(version, globalIndex)
                                      }
                                    >
                                      <div className="flex-1 min-w-0">
                                        {/* Version Name/Timestamp - Editable like Google Docs */}
                                        {editingVersionId === version.id ? (
                                          <div
                                            className="flex items-center gap-1"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              type="text"
                                              value={editingVersionName}
                                              onChange={(e) =>
                                                setEditingVersionName(
                                                  e.target.value
                                                )
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  handleSaveVersionName(
                                                    version.id
                                                  );
                                                } else if (e.key === "Escape") {
                                                  handleCancelEditingVersionName();
                                                }
                                              }}
                                              placeholder="Name this version"
                                              autoFocus
                                              className="flex-1 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 midnight:bg-gray-800 border border-blue-500 rounded text-gray-900 dark:text-gray-100 midnight:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <button
                                              onClick={() =>
                                                handleSaveVersionName(
                                                  version.id
                                                )
                                              }
                                              className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                              title="Save"
                                            >
                                              <Save className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={
                                                handleCancelEditingVersionName
                                              }
                                              className="p-1 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 midnight:hover:bg-gray-600 transition-colors"
                                              title="Cancel"
                                            >
                                              <CircleX className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div
                                            className="flex items-center gap-2 cursor-pointer group/name"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStartEditingVersionName(
                                                version
                                              );
                                            }}
                                          >
                                            {version.metadata
                                              ?.checkpoint_name ? (
                                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-200 group-hover/name:text-blue-600 dark:group-hover/name:text-blue-400">
                                                {
                                                  version.metadata
                                                    .checkpoint_name
                                                }
                                              </span>
                                            ) : (
                                              <span className="text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-200 group-hover/name:text-blue-600 dark:group-hover/name:text-blue-400">
                                                {formatDateTime(
                                                  version.created_at
                                                )}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {/* Show timestamp below if there's a custom name */}
                                        {version.metadata?.checkpoint_name &&
                                          editingVersionId !== version.id && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mt-0.5">
                                              {formatDateTime(
                                                version.created_at
                                              )}
                                            </div>
                                          )}
                                        {isFirst && (
                                          <div className="text-xs mt-1">
                                            <span className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded dark:bg-blue-900 dark:text-blue-300 midnight:bg-blue-900/40 midnight:text-blue-300 border border-blue-200 dark:border-blue-800 midnight:border-blue-800/50">
                                              Current version
                                            </span>
                                          </div>
                                        )}
                                        {/* Display all contributors */}
                                        <div className="mt-1 space-y-1">
                                          {contributorsForVersion.map(
                                            (user, idx) => (
                                              <div
                                                key={idx}
                                                className="text-xs flex items-center gap-1.5"
                                              >
                                                {getProfilePicture(
                                                  user?.profile_picture
                                                ) ? (
                                                  <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                                                    <img
                                                      src={getProfilePicture(
                                                        user.profile_picture
                                                      )}
                                                      alt={user.name}
                                                      className="w-full h-full object-cover"
                                                    />
                                                  </div>
                                                ) : (
                                                  <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                                    {(
                                                      user?.name?.charAt(0) ||
                                                      "U"
                                                    ).toUpperCase()}
                                                  </div>
                                                )}
                                                <span
                                                  style={{
                                                    color: getUserColor(
                                                      user?.name ||
                                                        "Unknown User"
                                                    ).main,
                                                  }}
                                                  className="font-medium"
                                                >
                                                  {user?.name || "Unknown User"}
                                                </span>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>

                                      {/* Three dot menu */}
                                      <button
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700/50 rounded"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowMenu(
                                            showMenu === version.id
                                              ? null
                                              : version.id
                                          );
                                        }}
                                      >
                                        <MoreVertical className="w-4 h-4 text-gray-500 midnight:text-gray-400" />
                                      </button>

                                      {/* Dropdown menu */}
                                      {showMenu === version.id && (
                                        <div className="absolute right-4 top-8 bg-gray-100 dark:bg-[#1a202c] midnight:bg-[#0a0e12] border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded shadow-lg z-50 w-48">
                                          <button
                                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 flex items-center gap-2"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              setShowMenu(null);

                                              try {
                                                // Fetch the full version data
                                                const versionData =
                                                  await versionHistoryApi.getVersion(
                                                    noteId,
                                                    version.id
                                                  );

                                                // Extract blocks from version data
                                                let blocks = [];
                                                if (versionData.blocks) {
                                                  if (
                                                    typeof versionData.blocks ===
                                                      "object" &&
                                                    versionData.blocks.blocks &&
                                                    Array.isArray(
                                                      versionData.blocks.blocks
                                                    )
                                                  ) {
                                                    blocks =
                                                      versionData.blocks.blocks;
                                                  } else if (
                                                    Array.isArray(
                                                      versionData.blocks
                                                    )
                                                  ) {
                                                    blocks = versionData.blocks;
                                                  }
                                                }

                                                // Call restore with full data including version ID for tracking
                                                await onVersionRestore?.({
                                                  title:
                                                    versionData.title || "",
                                                  content: blocks,
                                                  versionId: version.id,
                                                  versionNumber:
                                                    versionData.version_number ??
                                                    version.version_number,
                                                });

                                                // Refresh version list after restore to show the new version
                                                setTimeout(() => {
                                                  loadVersions();
                                                }, 1000);
                                              } catch (error) {
                                                console.error(
                                                  "Failed to restore version:",
                                                  error
                                                );
                                              }
                                            }}
                                          >
                                            <RotateCcw className="w-4 h-4" />
                                            Restore this version
                                          </button>
                                          <button
                                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 flex items-center gap-2"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setShowMenu(null);
                                              handleStartEditingVersionName(
                                                version
                                              );
                                            }}
                                          >
                                            <Tag className="w-4 h-4" />
                                            Name this version
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              // Multiple versions in group - show collapsible group
                              const firstVersion = timeGroup[0];
                              const firstGlobalIndex = versions.findIndex(
                                (v) => v.id === firstVersion.id
                              );
                              const isFirstInList = firstGlobalIndex === 0;

                              // Get unique users in this time group
                              const groupContributorMap = new Map();
                              timeGroup.forEach((v) => {
                                const contributors =
                                  Array.isArray(v.allContributors) &&
                                  v.allContributors.length > 0
                                    ? v.allContributors
                                    : collectContributorsForDisplay(v);
                                contributors.forEach((contributor) => {
                                  if (!groupContributorMap.has(contributor.name)) {
                                    groupContributorMap.set(
                                      contributor.name,
                                      contributor
                                    );
                                  }
                                });
                              });
                              const uniqueUsers = Array.from(
                                groupContributorMap.values()
                              );

                              // Check if any version in this group is selected
                              const isGroupSelected = timeGroup.some(
                                (v) => v.id === selectedVersionId
                              );

                              return (
                                <div key={groupKey}>
                                  {/* Time group header */}
                                  <div
                                    className={`px-4 py-2 cursor-pointer relative group ${
                                      isGroupSelected && !isGroupExpanded
                                        ? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30"
                                        : "hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800/50"
                                    }`}
                                    onClick={(e) => {
                                      // Don't toggle if clicking on the group name
                                      if (
                                        !e.target.closest(
                                          ".group-name-editable"
                                        )
                                      ) {
                                        toggleTimeGroup(groupKey);
                                      }
                                    }}
                                  >
                                    <div className="flex-1 min-w-0">
                                      {/* Group Name/Timestamp - Editable */}
                                      {editingGroupKey === groupKey ? (
                                        <div
                                          className="flex items-center gap-1"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ChevronRight className="w-3 h-3 text-gray-400 midnight:text-gray-500 flex-shrink-0" />
                                          <input
                                            type="text"
                                            value={editingGroupName}
                                            onChange={(e) =>
                                              setEditingGroupName(
                                                e.target.value
                                              )
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                handleSaveGroupName(groupKey);
                                              } else if (e.key === "Escape") {
                                                handleCancelEditingGroupName();
                                              }
                                            }}
                                            placeholder="Name this group"
                                            autoFocus
                                            className="flex-1 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 midnight:bg-gray-800 border border-blue-500 rounded text-gray-900 dark:text-gray-100 midnight:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          />
                                          <button
                                            onClick={() =>
                                              handleSaveGroupName(groupKey)
                                            }
                                            className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex-shrink-0"
                                            title="Save"
                                          >
                                            <Save className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={
                                              handleCancelEditingGroupName
                                            }
                                            className="p-1 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 midnight:hover:bg-gray-600 transition-colors flex-shrink-0"
                                            title="Cancel"
                                          >
                                            <CircleX className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <div>
                                            {isGroupExpanded ? (
                                              <ChevronDown className="w-3 h-3 text-gray-400 midnight:text-gray-500" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3 text-gray-400 midnight:text-gray-500" />
                                            )}
                                          </div>
                                          <span
                                            className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-200 group-name-editable hover:text-blue-600 dark:hover:text-blue-400"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStartEditingGroupName(
                                                groupKey,
                                                groupNames[groupKey] || ""
                                              );
                                            }}
                                          >
                                            {groupNames[groupKey] ||
                                              formatDateTime(
                                                firstVersion.created_at
                                              )}
                                          </span>
                                        </div>
                                      )}
                                      {/* Show timestamp below if there's a custom group name */}
                                      {groupNames[groupKey] &&
                                        editingGroupKey !== groupKey && (
                                          <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mt-0.5 ml-5">
                                            {formatDateTime(
                                              firstVersion.created_at
                                            )}
                                          </div>
                                        )}
                                      {isFirstInList && !isGroupExpanded && (
                                        <div className="text-xs mt-1 ml-5">
                                          <span className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded dark:bg-blue-900 dark:text-blue-300 midnight:bg-blue-900/40 midnight:text-blue-300 border border-blue-200 dark:border-blue-800 midnight:border-blue-800/50">
                                            Current version
                                          </span>
                                        </div>
                                      )}
                                      {/* Show each user on a separate line */}
                                      <div className="ml-5 mt-1 space-y-1">
                                        {uniqueUsers.map((user, idx) => (
                                          <div
                                            key={idx}
                                            className="text-xs flex items-center gap-1.5"
                                          >
                                            {getProfilePicture(
                                              user?.profile_picture
                                            ) ? (
                                              <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                                                <img
                                                  src={getProfilePicture(
                                                    user.profile_picture
                                                  )}
                                                  alt={user.name}
                                                  className="w-full h-full object-cover"
                                                />
                                              </div>
                                            ) : (
                                              <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                                {(
                                                  user?.name?.charAt(0) || "U"
                                                ).toUpperCase()}
                                              </div>
                                            )}
                                            <span
                                              style={{
                                                color: getUserColor(
                                                  user?.name || "Unknown User"
                                                ).main,
                                              }}
                                              className="font-medium"
                                            >
                                              {user?.name || "Unknown User"}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Expanded versions in group */}
                                  {isGroupExpanded && (
                                    <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-700 midnight:border-gray-600">
                                      {timeGroup.map((version) => {
                                        const globalIndex = versions.findIndex(
                                          (v) => v.id === version.id
                                        );
                                        const isFirst = globalIndex === 0;

                                        const contributorsForVersion =
                                          Array.isArray(version.allContributors) &&
                                          version.allContributors.length > 0
                                            ? version.allContributors
                                            : collectContributorsForDisplay(
                                                version
                                              );

                                        return (
                                          <div
                                            key={version.id}
                                            className="relative group"
                                            data-version-id={version.id}
                                          >
                                            <div
                                              className={`px-4 py-2 cursor-pointer flex items-start justify-between ${
                                                selectedVersionId === version.id
                                                  ? "bg-blue-50 dark:bg-blue-900/20 midnight:bg-blue-900/30"
                                                  : "hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800/50"
                                              }`}
                                              onClick={() =>
                                                handleVersionClick(
                                                  version,
                                                  globalIndex
                                                )
                                              }
                                            >
                                              <div className="flex-1 min-w-0">
                                                {/* Version Name/Timestamp - Editable like Google Docs */}
                                                {editingVersionId ===
                                                version.id ? (
                                                  <div
                                                    className="flex items-center gap-1"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  >
                                                    <input
                                                      type="text"
                                                      value={editingVersionName}
                                                      onChange={(e) =>
                                                        setEditingVersionName(
                                                          e.target.value
                                                        )
                                                      }
                                                      onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                          handleSaveVersionName(
                                                            version.id
                                                          );
                                                        } else if (
                                                          e.key === "Escape"
                                                        ) {
                                                          handleCancelEditingVersionName();
                                                        }
                                                      }}
                                                      placeholder="Name this version"
                                                      autoFocus
                                                      className="flex-1 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 midnight:bg-gray-800 border border-blue-500 rounded text-gray-900 dark:text-gray-100 midnight:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                    <button
                                                      onClick={() =>
                                                        handleSaveVersionName(
                                                          version.id
                                                        )
                                                      }
                                                      className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                                      title="Save"
                                                    >
                                                      <Save className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                      onClick={
                                                        handleCancelEditingVersionName
                                                      }
                                                      className="p-1 bg-gray-200 dark:bg-gray-600 midnight:bg-gray-700 text-gray-700 dark:text-gray-300 midnight:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500 midnight:hover:bg-gray-600 transition-colors"
                                                      title="Cancel"
                                                    >
                                                      <CircleX className="w-3 h-3" />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <div
                                                    className="flex items-center gap-2 cursor-pointer group/name"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleStartEditingVersionName(
                                                        version
                                                      );
                                                    }}
                                                  >
                                                    {version.metadata
                                                      ?.checkpoint_name ? (
                                                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-200 group-hover/name:text-blue-600 dark:group-hover/name:text-blue-400">
                                                        {
                                                          version.metadata
                                                            .checkpoint_name
                                                        }
                                                      </span>
                                                    ) : (
                                                      <span className="text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-200 group-hover/name:text-blue-600 dark:group-hover/name:text-blue-400">
                                                        {formatDateTime(
                                                          version.created_at
                                                        )}
                                                      </span>
                                                    )}
                                                  </div>
                                                )}
                                                {/* Show timestamp below if there's a custom name */}
                                                {version.metadata
                                                  ?.checkpoint_name &&
                                                  editingVersionId !==
                                                    version.id && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 mt-0.5">
                                                      {formatDateTime(
                                                        version.created_at
                                                      )}
                                                    </div>
                                                  )}
                                                {isFirst && (
                                                  <div className="text-xs mt-1">
                                                    <span className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded dark:bg-blue-900 dark:text-blue-300 midnight:bg-blue-900/40 midnight:text-blue-300 border border-blue-200 dark:border-blue-800 midnight:border-blue-800/50">
                                                      Current version
                                                    </span>
                                                  </div>
                                                )}
                                                {/* Display all contributors */}
                                                <div className="mt-1 space-y-1">
                                                  {contributorsForVersion.map(
                                                    (user, idx) => (
                                                      <div
                                                        key={idx}
                                                        className="text-xs flex items-center gap-1.5"
                                                      >
                                                        {getProfilePicture(
                                                          user?.profile_picture
                                                        ) ? (
                                                          <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                                                            <img
                                                              src={getProfilePicture(
                                                                user.profile_picture
                                                              )}
                                                              alt={user.name}
                                                              className="w-full h-full object-cover"
                                                            />
                                                          </div>
                                                        ) : (
                                                          <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                                            {(
                                                              user?.name?.charAt(
                                                                0
                                                              ) || "U"
                                                            ).toUpperCase()}
                                                          </div>
                                                        )}
                                                        <span
                                                          style={{
                                                            color: getUserColor(
                                                              user?.name ||
                                                                "Unknown User"
                                                            ).main,
                                                          }}
                                                          className="font-medium"
                                                        >
                                                          {user?.name ||
                                                            "Unknown User"}
                                                        </span>
                                                      </div>
                                                    )
                                                  )}
                                                </div>
                                              </div>

                                              {/* Three dot menu */}
                                              <button
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-700/50 rounded"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setShowMenu(
                                                    showMenu === version.id
                                                      ? null
                                                      : version.id
                                                  );
                                                }}
                                              >
                                                <MoreVertical className="w-4 h-4 text-gray-500 midnight:text-gray-400" />
                                              </button>

                                              {/* Dropdown menu */}
                                              {showMenu === version.id && (
                                                <div className="absolute right-4 top-8 bg-gray-100 dark:bg-[#1a202c] midnight:bg-[#0a0e12] border border-gray-200 dark:border-gray-700 midnight:border-gray-600 rounded shadow-lg z-50 w-48">
                                                  <button
                                                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 flex items-center gap-2"
                                                    onClick={async (e) => {
                                                      e.stopPropagation();
                                                      setShowMenu(null);

                                                      try {
                                                        const versionData =
                                                          await versionHistoryApi.getVersion(
                                                            noteId,
                                                            version.id
                                                          );

                                                        let blocks = [];
                                                        if (
                                                          versionData.blocks
                                                        ) {
                                                          if (
                                                            typeof versionData.blocks ===
                                                              "object" &&
                                                            versionData.blocks
                                                              .blocks &&
                                                            Array.isArray(
                                                              versionData.blocks
                                                                .blocks
                                                            )
                                                          ) {
                                                            blocks =
                                                              versionData.blocks
                                                                .blocks;
                                                          } else if (
                                                            Array.isArray(
                                                              versionData.blocks
                                                            )
                                                          ) {
                                                            blocks =
                                                              versionData.blocks;
                                                          }
                                                        }

                                                        await onVersionRestore?.(
                                                          {
                                                            title:
                                                              versionData.title ||
                                                              "",
                                                            content: blocks,
                                                            versionId:
                                                              version.id,
                                                            versionNumber:
                                                              versionData.version_number ??
                                                              version.version_number,
                                                          }
                                                        );

                                                        setTimeout(() => {
                                                          loadVersions();
                                                        }, 1000);
                                                      } catch (error) {
                                                        console.error(
                                                          "Failed to restore version:",
                                                          error
                                                        );
                                                      }
                                                    }}
                                                  >
                                                    <RotateCcw className="w-4 h-4" />
                                                    Restore this version
                                                  </button>
                                                  <button
                                                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-200 dark:hover:bg-gray-700 midnight:hover:bg-gray-800 text-gray-700 dark:text-gray-300 midnight:text-gray-300 flex items-center gap-2"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setShowMenu(null);
                                                      handleStartEditingVersionName(
                                                        version
                                                      );
                                                    }}
                                                  >
                                                    <Tag className="w-4 h-4" />
                                                    Name this version
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default VersionHistoryPanel;
