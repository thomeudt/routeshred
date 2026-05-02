import React, { useMemo, useState } from 'react';
import { FiCheck, FiEdit2, FiFolder, FiSave, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { useAuth } from '../auth/AuthProvider';
import { t } from '../i18n';
import { useRouteStore } from '../store/routeStore';

function formatDistance(meters) {
  const value = Number(meters) || 0;
  return value > 0 ? `${(value / 1000).toFixed(1)} km` : '—';
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  return value > 0 ? `${Math.round(value / 60)} min` : '—';
}

function SavedRoutesPanel() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [routeName, setRouteName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const {
    route,
    savedRoutes,
    savedRoutesLoading,
    savedRoutesError,
    activeSavedRouteId,
    routeSaveState,
    saveCurrentRoute,
    loadSavedRoute,
    deleteSavedRoute,
    renameSavedRoute
  } = useRouteStore();

  const filteredRoutes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return savedRoutes;
    }

    return savedRoutes.filter((savedRoute) => [
      savedRoute.name,
      savedRoute.startLabel,
      savedRoute.endLabel,
      savedRoute.bikeType,
      savedRoute.rideType
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [query, savedRoutes]);

  const startRename = (savedRoute) => {
    setEditingId(savedRoute.id);
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

    await renameSavedRoute(token, editingId, editingName.trim());
    cancelRename();
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
          const isActive = activeSavedRouteId === savedRoute.id;
          const isEditing = editingId === savedRoute.id;
          return (
            <div
              className={`saved-route-item${isActive ? ' is-active' : ''}`}
              key={savedRoute.id}
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
                  onClick={() => loadSavedRoute(token, savedRoute.id)}
                >
                  <span>{savedRoute.name}</span>
                  <small>
                    {formatDistance(savedRoute.distance)} · {formatDuration(savedRoute.duration)}
                  </small>
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
                    <button type="button" onClick={() => startRename(savedRoute)} aria-label={t('route.saved.rename')}>
                      <FiEdit2 />
                    </button>
                    <button type="button" onClick={() => deleteSavedRoute(token, savedRoute.id)} aria-label={t('route.saved.delete')}>
                      <FiTrash2 />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {savedRoutesError && <small className="saved-route-error">{savedRoutesError}</small>}
    </div>
  );
}

export default SavedRoutesPanel;
