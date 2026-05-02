import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  FiCheck,
  FiEdit2,
  FiFolder,
  FiGlobe,
  FiLink,
  FiLock,
  FiSave,
  FiSearch,
  FiShare2,
  FiTrash2,
  FiX
} from 'react-icons/fi';
import { useAuth } from '../auth/AuthProvider';
import { t } from '../i18n';
import { useRouteStore } from '../store/routeStore';

const rawApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';

function formatDistance(meters) {
  const value = Number(meters) || 0;
  return value > 0 ? `${(value / 1000).toFixed(1)} km` : '—';
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  return value > 0 ? `${Math.round(value / 60)} min` : '—';
}

function getRouteSourceLabel(savedRoute) {
  if (savedRoute.access === 'own') {
    return t('route.saved.own');
  }

  const owner = savedRoute.ownerName || t('common.unknown');
  return savedRoute.access === 'public'
    ? t('route.saved.publicBy', { owner })
    : t('route.saved.sharedBy', { owner });
}

function SavedRoutesPanel({ context = 'mixed' }) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [accessFilter, setAccessFilter] = useState('all');
  const [routeName, setRouteName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [sharingId, setSharingId] = useState(null);
  const [shareQuery, setShareQuery] = useState('');
  const [shareDraftIds, setShareDraftIds] = useState([]);
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  const [userSuggestions, setUserSuggestions] = useState([]);
  const [sharedUserLabels, setSharedUserLabels] = useState({});
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const {
    route,
    savedRoutes,
    savedRoutesLoading,
    savedRoutesError,
    activeSavedRouteId,
    activeSavedRouteOwner,
    routeSaveState,
    saveCurrentRoute,
    loadSavedRoute,
    deleteSavedRoute,
    renameSavedRoute,
    updateSavedRouteSharing
  } = useRouteStore();

  const effectiveContext = ['my', 'public', 'mixed'].includes(context) ? context : 'mixed';
  const availableFilters = effectiveContext === 'my'
    ? ['own', 'shared']
    : effectiveContext === 'public'
      ? ['public']
      : ['all', 'own', 'shared', 'public'];

  useEffect(() => {
    if (effectiveContext === 'my') {
      setAccessFilter('own');
      return;
    }
    if (effectiveContext === 'public') {
      setAccessFilter('public');
      return;
    }
    setAccessFilter('all');
  }, [effectiveContext]);

  const filteredRoutes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byText = !needle ? savedRoutes : savedRoutes.filter((savedRoute) => [
      savedRoute.name,
      savedRoute.startLabel,
      savedRoute.endLabel,
      savedRoute.bikeType,
      savedRoute.rideType,
      savedRoute.ownerName,
      savedRoute.access
    ].some((value) => String(value || '').toLowerCase().includes(needle)));

    if (accessFilter === 'all') {
      return byText;
    }

    return byText.filter((savedRoute) => {
      if (accessFilter === 'own') return savedRoute.access === 'own';
      if (accessFilter === 'shared') return savedRoute.access === 'shared';
      if (accessFilter === 'public') return savedRoute.visibility === 'public' || savedRoute.access === 'public';
      return true;
    });
  }, [query, savedRoutes, accessFilter]);

  const routeKey = (savedRoute) => `${savedRoute.ownerSub || ''}:${savedRoute.id}`;

  const buildPublicShareLink = (savedRoute) => {
    const owner = String(savedRoute.ownerSub || '').trim();
    const routeId = String(savedRoute.id || '').trim();
    if (!owner || !routeId) {
      return '';
    }

    const params = new URLSearchParams({ sharedRoute: routeId, owner });
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  };

  const copyPublicShareLink = async (savedRoute) => {
    if (savedRoute.visibility !== 'public') {
      return;
    }

    const link = buildPublicShareLink(savedRoute);
    if (!link) {
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const helper = document.createElement('textarea');
        helper.value = link;
        helper.setAttribute('readonly', 'readonly');
        helper.style.position = 'absolute';
        helper.style.left = '-9999px';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        document.body.removeChild(helper);
      }
      const key = routeKey(savedRoute);
      setCopiedLinkId(key);
      setTimeout(() => {
        setCopiedLinkId((current) => (current === key ? null : current));
      }, 1400);
    } catch (_) {
      // Ignore clipboard errors silently.
    }
  };

  useEffect(() => {
    let mounted = true;
    const needle = shareQuery.trim();

    if (!sharingId || !token) {
      setUserSuggestions([]);
      return () => { mounted = false; };
    }

    const timeout = setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/users/search`, {
          params: { q: needle },
          headers: { Authorization: `Bearer ${token}` }
        });
        if (mounted) {
          setUserSuggestions(Array.isArray(response.data?.users) ? response.data.users : []);
        }
      } catch (_) {
        if (mounted) {
          setUserSuggestions([]);
        }
      } finally {
        if (mounted) {
          setUserSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [shareQuery, sharingId, token]);

  useEffect(() => {
    let mounted = true;
    const ids = shareDraftIds;

    if (!sharingId || !token || !ids.length) {
      return () => { mounted = false; };
    }

    async function resolveUsers() {
      try {
        const response = await axios.get(`${API_BASE}/users/resolve`, {
          params: { ids: ids.join(',') },
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!mounted) return;
        const next = {};
        (Array.isArray(response.data?.users) ? response.data.users : []).forEach((user) => {
          next[user.id] = user;
        });
        setSharedUserLabels((current) => ({ ...current, ...next }));
      } catch (_) {
        // Keep raw IDs visible if resolving fails.
      }
    }

    resolveUsers();
    return () => { mounted = false; };
  }, [shareDraftIds, sharingId, token]);

  const startRename = (savedRoute) => {
    setEditingId(routeKey(savedRoute));
    setEditingName(savedRoute.name || '');
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const commitRename = async () => {
    if (!editingId || !editingName.trim()) {
      cancelRename();
      return;
    }

    const savedRoute = savedRoutes.find((candidate) => routeKey(candidate) === editingId);
    if (savedRoute) {
      await renameSavedRoute(token, savedRoute.id, editingName.trim(), savedRoute.ownerSub);
    }
    cancelRename();
  };

  const startSharing = (savedRoute) => {
    setSharingId(routeKey(savedRoute));
    setShareQuery('');
    setShareDraftIds(Array.isArray(savedRoute.sharedWith) ? savedRoute.sharedWith : []);
    setUserSuggestions([]);
    setUserSearchLoading(true);
  };

  const cancelSharing = () => {
    setSharingId(null);
    setShareQuery('');
    setShareDraftIds([]);
    setUserSuggestions([]);
  };

  const commitSharing = async (savedRoute, overrides = {}) => {
    await updateSavedRouteSharing(token, savedRoute.id, {
      visibility: savedRoute.visibility || 'private',
      sharedWith: shareDraftIds,
      ...overrides
    });
    cancelSharing();
  };

  const removeSharedUser = async (savedRoute, userId) => {
    const sharedWith = shareDraftIds.filter((id) => id !== userId);
    setShareDraftIds(sharedWith);
    await updateSavedRouteSharing(token, savedRoute.id, {
      visibility: savedRoute.visibility || 'private',
      sharedWith
    });
  };

  const handleSave = async () => {
    await saveCurrentRoute(token, routeName.trim());
    setRouteName('');
  };

  return (
    <div className="control-group saved-routes-panel">
      <div className="saved-routes-heading">
        <label>{t('route.saved.title')}</label>
        <span>{savedRoutes.length}</span>
      </div>

      <div className="saved-route-filters" role="tablist" aria-label={t('route.saved.filterLabel')}>
        {availableFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={accessFilter === filter}
            className={accessFilter === filter ? 'active' : ''}
            onClick={() => setAccessFilter(filter)}
          >
            {t(`route.saved.filters.${filter}`)}
          </button>
        ))}
      </div>

      <div className="saved-route-savebar">
        <input
          type="text"
          value={routeName}
          onChange={(event) => setRouteName(event.target.value)}
          placeholder={t('route.saved.namePlaceholder')}
          maxLength="120"
        />
        <button
          className="btn-secondary"
          type="button"
          onClick={handleSave}
          disabled={!route || routeSaveState === 'saving'}
        >
          {routeSaveState === 'saving' ? <FiFolder /> : <FiSave />}
          {routeSaveState === 'saved' ? t('route.saved.saved') : t('route.saved.save')}
        </button>
      </div>

      <div className="saved-route-search">
        <FiSearch />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('route.saved.searchPlaceholder')}
        />
      </div>

      <div className="saved-route-list">
        {savedRoutesLoading && (
          <div className="saved-route-empty">{t('route.saved.loading')}</div>
        )}
        {!savedRoutesLoading && !filteredRoutes.length && (
          <div className="saved-route-empty">
            {query ? t('route.saved.noSearchResults') : t('route.saved.empty')}
          </div>
        )}
        {!savedRoutesLoading && filteredRoutes.map((savedRoute) => {
          const key = routeKey(savedRoute);
          const isActive = activeSavedRouteId === savedRoute.id && (!activeSavedRouteOwner || activeSavedRouteOwner === savedRoute.ownerSub);
          const isEditing = editingId === key;
          const isSharing = sharingId === key;
          const canEdit = savedRoute.canEdit !== false;
          return (
            <div
              className={`saved-route-item${isActive ? ' is-active' : ''}`}
              key={key}
            >
              {isEditing ? (
                <div className="saved-route-main">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename();
                      if (event.key === 'Escape') cancelRename();
                    }}
                    maxLength="120"
                    autoFocus
                  />
                  <small>
                    {formatDistance(savedRoute.distance)} · {formatDuration(savedRoute.duration)}
                  </small>
                </div>
              ) : (
                <button
                  className="saved-route-main"
                  type="button"
                  onClick={() => {
                    loadSavedRoute(token, savedRoute.id, savedRoute.ownerSub);
                    window.dispatchEvent(new CustomEvent('routeshred:set-tab', { detail: { tab: 'plan' } }));
                  }}
                >
                  <span>{savedRoute.name}</span>
                  <small>
                    {formatDistance(savedRoute.distance)} · {formatDuration(savedRoute.duration)} · {t(`route.saved.access.${savedRoute.access || 'own'}`)}
                  </small>
                  {savedRoute.access !== 'own' && (
                    <small className="saved-route-source">{getRouteSourceLabel(savedRoute)}</small>
                  )}
                </button>
              )}
              <div className="saved-route-tools">
                {isEditing ? (
                  <>
                    <button type="button" onClick={commitRename} aria-label={t('route.saved.renameSave')}>
                      <FiCheck />
                    </button>
                    <button type="button" onClick={cancelRename} aria-label={t('route.saved.renameCancel')}>
                      <FiX />
                    </button>
                  </>
                ) : (
                  <>
                    {canEdit && (
                      <>
                        <button type="button" onClick={() => startRename(savedRoute)} aria-label={t('route.saved.rename')}>
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSavedRouteSharing(token, savedRoute.id, {
                            visibility: savedRoute.visibility === 'public' ? 'private' : 'public',
                            sharedWith: savedRoute.sharedWith || []
                          })}
                          aria-label={savedRoute.visibility === 'public' ? t('route.saved.makePrivate') : t('route.saved.makePublic')}
                          title={savedRoute.visibility === 'public' ? t('route.saved.makePrivate') : t('route.saved.makePublic')}
                        >
                          {savedRoute.visibility === 'public' ? <FiGlobe /> : <FiLock />}
                        </button>
                        {savedRoute.visibility === 'public' && (
                          <button
                            type="button"
                            onClick={() => copyPublicShareLink(savedRoute)}
                            aria-label={t('route.saved.copyLink')}
                            title={copiedLinkId === key ? t('route.saved.copyLinkCopied') : t('route.saved.copyLink')}
                          >
                            {copiedLinkId === key ? <FiCheck /> : <FiLink />}
                          </button>
                        )}
                        <button type="button" onClick={() => startSharing(savedRoute)} aria-label={t('route.saved.share')}>
                          <FiShare2 />
                        </button>
                        <button type="button" onClick={() => deleteSavedRoute(token, savedRoute.id, savedRoute.ownerSub)} aria-label={t('route.saved.delete')}>
                          <FiTrash2 />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
              {isSharing && canEdit && (
                <div className="saved-route-share">
                  {Boolean(shareDraftIds.length) && (
                    <div className="saved-route-share-chips">
                      {shareDraftIds.map((userId) => {
                        const user = sharedUserLabels[userId];
                        return (
                          <span key={userId}>
                            <strong>{user ? user.label : userId}</strong>
                            <button
                              type="button"
                              onClick={() => removeSharedUser(savedRoute, userId)}
                              aria-label={t('route.saved.unshareUser')}
                              title={t('route.saved.unshareUser')}
                            >
                              <FiX />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <input
                    type="text"
                    value={shareQuery}
                    onChange={(event) => setShareQuery(event.target.value)}
                    placeholder={t('route.saved.sharePlaceholder')}
                    autoFocus
                  />
                  {Boolean(userSuggestions.length || userSearchLoading) && (
                    <div className="saved-route-user-suggestions">
                      {userSearchLoading && <div>{t('route.saved.searchingUsers')}</div>}
                      {!userSearchLoading && userSuggestions.map((user) => (
                        <button
                          type="button"
                          key={user.id}
                          onClick={() => {
                            setShareDraftIds((current) => (
                              current.includes(user.id) ? current : [...current, user.id]
                            ));
                            setShareQuery('');
                            setSharedUserLabels((current) => ({ ...current, [user.id]: user }));
                            setUserSuggestions([]);
                          }}
                        >
                          <span>{user.label}</span>
                          <small>{user.detail}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => commitSharing(savedRoute)}>
                    <FiCheck /> {t('route.saved.shareSave')}
                  </button>
                  <button type="button" onClick={cancelSharing} aria-label={t('route.saved.shareCancel')}>
                    <FiX />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {savedRoutesError && <small className="saved-route-error">{savedRoutesError}</small>}
    </div>
  );
}

export default SavedRoutesPanel;
