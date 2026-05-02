import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FiArrowRight, FiCheck, FiClock, FiEdit2, FiFlag, FiGlobe, FiInstagram, FiMap, FiMapPin, FiMessageSquare, FiPlus, FiSearch, FiShare2, FiTrash2, FiUsers, FiX } from 'react-icons/fi';
import { useAuth } from '../auth/AuthProvider';
import { t } from '../i18n';
import { useRouteStore } from '../store/routeStore';

const rawApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';

const CHALLENGES = ['social', 'tempo', 'climbing', 'sprint', 'endurance'];

function resolveApiMessage(error, fallback) {
  const status = Number(error?.response?.status || 0);
  const message = String(error?.response?.data?.message || '').toLowerCase();
  if (status === 401 && (message.includes('invalid or expired access token') || message.includes('bearer token required'))) {
    return t('auth.sessionExpired');
  }
  return error?.response?.data?.message || fallback;
}

function formatRideDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' · ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function isPastRide(ride) {
  const startAt = Date.parse(String(ride?.startAt || ''));
  return Number.isFinite(startAt) && startAt < Date.now();
}

function toLocalInputValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getInstagramEmbedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!['instagram.com', 'instagr.am'].includes(host)) {
      return '';
    }

    const [type, shortcode] = url.pathname.split('/').filter(Boolean);
    if (!['p', 'reel', 'tv'].includes(type) || !shortcode) {
      return '';
    }

    return `https://www.instagram.com/${type}/${encodeURIComponent(shortcode)}/embed`;
  } catch (_) {
    return '';
  }
}

function GroupRidesPanel() {
  const { token } = useAuth();
  const { savedRoutes, loadSavedRoute } = useRouteStore();
  const [groupRideTarget] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const rideId = String(params.get('groupRide') || '').trim();
    const owner = String(params.get('owner') || '').trim();
    if (!rideId || !owner) {
      return null;
    }
    return { rideId, owner };
  });
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createState, setCreateState] = useState('idle');
  const [editingRideId, setEditingRideId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [editState, setEditState] = useState('idle');
  const [editRoutePickerQuery, setEditRoutePickerQuery] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(new Set());

  const toggleComments = (rideId) => {
    setCommentsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(rideId)) next.delete(rideId); else next.add(rideId);
      return next;
    });
  };
  const [commentDrafts, setCommentDrafts] = useState({});
  const [shareFeedback, setShareFeedback] = useState('');
  const [rideFilterQuery, setRideFilterQuery] = useState('');
  const [rideChallengeFilter, setRideChallengeFilter] = useState('all');
  const [showPastRides, setShowPastRides] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    challenge: 'social',
    instagramUrl: '',
    meetingPoint: '',
    startAt: '',
    visibility: 'public',
    routeId: '',
    routeOwnerSub: '',
    routeName: ''
  });

  const [routePickerQuery, setRoutePickerQuery] = useState('');

  const ownRoutes = useMemo(
    () => savedRoutes.filter((r) => r.access === 'own'),
    [savedRoutes]
  );

  const filteredPickerRoutes = useMemo(() => {
    const needle = routePickerQuery.trim().toLowerCase();
    if (!needle) return ownRoutes;
    return ownRoutes.filter((r) => String(r.name || '').toLowerCase().includes(needle));
  }, [ownRoutes, routePickerQuery]);

  const filteredEditPickerRoutes = useMemo(() => {
    const needle = editRoutePickerQuery.trim().toLowerCase();
    if (!needle) return ownRoutes;
    return ownRoutes.filter((r) => String(r.name || '').toLowerCase().includes(needle));
  }, [ownRoutes, editRoutePickerQuery]);

  const filteredSortedRides = useMemo(() => {
    const needle = rideFilterQuery.trim().toLowerCase();

    return rides
      .filter((ride) => {
        if (!showPastRides && isPastRide(ride)) {
          return false;
        }

        if (rideChallengeFilter !== 'all' && (ride.challenge || 'social') !== rideChallengeFilter) {
          return false;
        }

        if (!needle) {
          return true;
        }

        const haystack = [
          ride.title,
          ride.description,
          ride.meetingPoint,
          ride.routeName,
          ride.ownerName
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        return haystack.includes(needle);
      })
      .sort((a, b) => String(b.startAt || b.updatedAt || '').localeCompare(String(a.startAt || a.updatedAt || '')));
  }, [rides, rideChallengeFilter, rideFilterQuery, showPastRides]);

  const loadRides = async () => {
    setLoading(true);
    setError('');

    try {
      if (token) {
        const response = await axios.get(`${API_BASE}/group-rides`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const visibleRides = Array.isArray(response.data?.rides) ? response.data.rides : [];

        if (groupRideTarget && !visibleRides.some((ride) => ride.id === groupRideTarget.rideId && ride.ownerSub === groupRideTarget.owner)) {
          try {
            const publicResponse = await axios.get(
              `${API_BASE}/group-rides/public/${encodeURIComponent(groupRideTarget.owner)}/${encodeURIComponent(groupRideTarget.rideId)}`
            );
            const linkedRide = publicResponse.data?.ride;
            if (linkedRide) {
              setRides([linkedRide, ...visibleRides.filter((ride) => !(ride.id === linkedRide.id && ride.ownerSub === linkedRide.ownerSub))]);
              return;
            }
          } catch (_) {
            // Ignore: fallback to authenticated list.
          }
        }

        setRides(visibleRides);
        return;
      }

      if (groupRideTarget) {
        const response = await axios.get(
          `${API_BASE}/group-rides/public/${encodeURIComponent(groupRideTarget.owner)}/${encodeURIComponent(groupRideTarget.rideId)}`
        );
        const linkedRide = response.data?.ride;
        setRides(linkedRide ? [linkedRide] : []);
        return;
      }

      setRides([]);
    } catch (loadError) {
      setError(resolveApiMessage(loadError, t('route.groupRides.errors.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRides();
  }, [token, groupRideTarget]);

  const handleCreate = async () => {
    if (!token || !draft.title.trim()) {
      return;
    }

    setCreateState('saving');
    setError('');
    try {
      const payload = {
        ...draft,
        startAt: draft.startAt ? new Date(draft.startAt).toISOString() : ''
      };
      const response = await axios.post(`${API_BASE}/group-rides`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const ride = response.data?.ride;
      setRides((current) => (ride ? [ride, ...current.filter((entry) => entry.id !== ride.id)] : current));
      setDraft({
        title: '',
        description: '',
        challenge: draft.challenge,
        instagramUrl: '',
        meetingPoint: '',
        startAt: '',
        visibility: draft.visibility,
        routeId: '',
        routeOwnerSub: '',
        routeName: ''
      });
      setCreateState('saved');
      setTimeout(() => setCreateState('idle'), 900);
    } catch (createError) {
      setCreateState('error');
      setError(resolveApiMessage(createError, t('route.groupRides.errors.createFailed')));
    }
  };

  const handleDelete = async (rideId) => {
    if (!token || !rideId) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/group-rides/${rideId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRides((current) => current.filter((ride) => ride.id !== rideId));
    } catch (deleteError) {
      setError(resolveApiMessage(deleteError, t('route.groupRides.errors.deleteFailed')));
    }
  };

  const startEdit = (ride) => {
    setEditingRideId(ride.id);
    setEditDraft({
      title: ride.title || '',
      description: ride.description || '',
      challenge: ride.challenge || 'social',
      instagramUrl: ride.instagramUrl || '',
      meetingPoint: ride.meetingPoint || '',
      startAt: toLocalInputValue(ride.startAt),
      visibility: ride.visibility || 'public',
      routeId: ride.routeId || '',
      routeOwnerSub: ride.routeOwnerSub || '',
      routeName: ride.routeName || ''
    });
    setEditRoutePickerQuery('');
    setEditState('idle');
  };

  const cancelEdit = () => {
    setEditingRideId(null);
    setEditDraft({});
    setEditRoutePickerQuery('');
  };

  const handleEdit = async (rideId) => {
    if (!token || !editDraft.title?.trim()) {
      return;
    }

    setEditState('saving');
    try {
      const payload = {
        ...editDraft,
        startAt: editDraft.startAt ? new Date(editDraft.startAt).toISOString() : ''
      };
      const response = await axios.patch(`${API_BASE}/group-rides/${rideId}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      upsertRide(response.data?.ride);
      cancelEdit();
    } catch (editError) {
      setEditState('error');
      setError(resolveApiMessage(editError, t('route.groupRides.errors.updateFailed')));
    }
  };

  const upsertRide = (nextRide) => {
    if (!nextRide || !nextRide.id) {
      return;
    }

    setRides((current) => {
      const exists = current.some((ride) => ride.id === nextRide.id && ride.ownerSub === nextRide.ownerSub);
      if (!exists) {
        return [nextRide, ...current];
      }

      return current.map((ride) => (
        ride.id === nextRide.id && ride.ownerSub === nextRide.ownerSub ? nextRide : ride
      ));
    });
  };

  const handleJoinToggle = async (ride) => {
    if (!token || !ride?.id) {
      return;
    }

    try {
      const endpoint = ride.isJoined ? 'leave' : 'join';
      const response = await axios.post(
        `${API_BASE}/group-rides/${ride.id}/${endpoint}`,
        { ownerSub: ride.ownerSub },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      upsertRide(response.data?.ride);
    } catch (joinError) {
      setError(resolveApiMessage(joinError, t('route.groupRides.errors.joinFailed')));
    }
  };

  const handleAddComment = async (ride) => {
    if (!token || !ride?.id) {
      return;
    }

    const text = String(commentDrafts[`${ride.ownerSub}:${ride.id}`] || '').trim();
    if (!text) {
      return;
    }

    try {
      const response = await axios.post(
        `${API_BASE}/group-rides/${ride.id}/comments`,
        { ownerSub: ride.ownerSub, text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      upsertRide(response.data?.ride);
      setCommentDrafts((current) => ({ ...current, [`${ride.ownerSub}:${ride.id}`]: '' }));
    } catch (commentError) {
      setError(resolveApiMessage(commentError, t('route.groupRides.errors.commentFailed')));
    }
  };

  const buildRideShareUrl = (ride) => {
    const params = new URLSearchParams({
      groupRide: String(ride.id || '').trim(),
      owner: String(ride.ownerSub || '').trim()
    });
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  };

  const getRideShareText = (ride) => {
    const parts = [ride.title, ride.challenge ? `#${ride.challenge}` : '', ride.meetingPoint || ''].filter(Boolean);
    return parts.join(' · ');
  };

  const handleShare = async (ride, platform) => {
    const shareUrl = buildRideShareUrl(ride);
    const shareText = getRideShareText(ride);
    const combined = `${shareText} ${shareUrl}`.trim();

    if (platform === 'copy') {
      try {
        await navigator.clipboard.writeText(combined);
        setShareFeedback(t('route.groupRides.share.copied'));
      } catch (_) {
        setShareFeedback(t('route.groupRides.share.copyFailed'));
      }
      window.setTimeout(() => setShareFeedback(''), 1500);
      return;
    }

    if (platform === 'instagram') {
      try {
        await navigator.clipboard.writeText(combined);
      } catch (_) {
        // If clipboard fails we still open Instagram, user can share manually.
      }
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      setShareFeedback(t('route.groupRides.share.instagramCopied'));
      window.setTimeout(() => setShareFeedback(''), 1800);
      return;
    }

    if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(combined)}`, '_blank', 'noopener,noreferrer');
      return;
    }

    if (platform === 'telegram') {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer');
      return;
    }
  };

  return (
    <section className="group-rides-panel">
      <div className="group-rides-heading">
        <label>
          <FiUsers size={14} />
          {t('route.groupRides.title')}
        </label>
        <div className="group-rides-heading-actions">
          <span>{rides.length}</span>
          {token && (
            <button
              type="button"
              className={`group-rides-create-toggle${createOpen ? ' is-open' : ''}`}
              onClick={() => setCreateOpen((v) => !v)}
            >
              <FiPlus size={13} />
              {t('route.groupRides.create')}
            </button>
          )}
        </div>
      </div>

      <div className="group-rides-filters" aria-label={t('route.groupRides.filters.label')}>
        <label className="group-rides-filter-search">
          <FiSearch size={12} />
          <input
            type="search"
            value={rideFilterQuery}
            onChange={(event) => setRideFilterQuery(event.target.value)}
            placeholder={t('route.groupRides.filters.search')}
          />
        </label>
        <label className="group-rides-filter-select">
          <FiFlag size={12} />
          <select
            value={rideChallengeFilter}
            onChange={(event) => setRideChallengeFilter(event.target.value)}
          >
            <option value="all">{t('route.groupRides.filters.allChallenges')}</option>
            {CHALLENGES.map((challenge) => (
              <option key={challenge} value={challenge}>{t(`route.groupRides.challenges.${challenge}`)}</option>
            ))}
          </select>
        </label>
        <label className="group-rides-past-toggle">
          <input
            type="checkbox"
            checked={showPastRides}
            onChange={(event) => setShowPastRides(event.target.checked)}
          />
          <FiClock size={12} />
          <span>{t('route.groupRides.filters.showPast')}</span>
        </label>
      </div>

      {createOpen && token && (
        <div className="group-rides-form">
          <input
            type="text"
            placeholder={t('route.groupRides.fields.title')}
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            maxLength={120}
          />
          <textarea
            placeholder={t('route.groupRides.fields.description')}
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            rows={3}
            maxLength={1200}
          />
          <div className="group-rides-form-row">
            <label>
              <FiFlag size={12} />
              <select
                value={draft.challenge}
                onChange={(event) => setDraft((current) => ({ ...current, challenge: event.target.value }))}
              >
                {CHALLENGES.map((challenge) => (
                  <option key={challenge} value={challenge}>{t(`route.groupRides.challenges.${challenge}`)}</option>
                ))}
              </select>
            </label>
            <label>
              <FiInstagram size={12} />
              <input
                type="url"
                placeholder={t('route.groupRides.fields.instagramUrl')}
                value={draft.instagramUrl}
                onChange={(event) => setDraft((current) => ({ ...current, instagramUrl: event.target.value }))}
              />
            </label>
          </div>
          <div className="group-rides-form-row">
            <label>
              <FiMapPin size={12} />
              <input
                type="text"
                placeholder={t('route.groupRides.fields.meetingPoint')}
                value={draft.meetingPoint}
                onChange={(event) => setDraft((current) => ({ ...current, meetingPoint: event.target.value }))}
                maxLength={240}
              />
            </label>
            <label>
              <FiClock size={12} />
              <input
                type="datetime-local"
                value={draft.startAt}
                onChange={(event) => setDraft((current) => ({ ...current, startAt: event.target.value }))}
              />
            </label>
            <label>
              <FiGlobe size={12} />
              <select
                value={draft.visibility}
                onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value }))}
              >
                <option value="public">{t('route.groupRides.visibility.public')}</option>
                <option value="private">{t('route.groupRides.visibility.private')}</option>
              </select>
            </label>
          </div>

          {ownRoutes.length > 0 && (
            <div className="group-rides-form-route-picker">
              {draft.routeId ? (
                <div className="ride-route-picker-selected">
                  <FiMap size={11} />
                  <span>{draft.routeName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((current) => ({ ...current, routeId: '', routeOwnerSub: '', routeName: '' }));
                      setRoutePickerQuery('');
                    }}
                    aria-label={t('route.groupRides.fields.noLinkedRoute')}
                  >
                    <FiX size={11} />
                  </button>
                </div>
              ) : (
                <div className="ride-route-picker-search">
                  <FiSearch size={11} />
                  <input
                    type="search"
                    value={routePickerQuery}
                    onChange={(event) => setRoutePickerQuery(event.target.value)}
                    placeholder={t('route.groupRides.fields.linkedRoute')}
                  />
                  {filteredPickerRoutes.length > 0 && (
                    <div className="ride-route-picker-list">
                      {filteredPickerRoutes.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setDraft((current) => ({
                              ...current,
                              routeId: r.id,
                              routeOwnerSub: r.ownerSub || '',
                              routeName: r.name || ''
                            }));
                            setRoutePickerQuery('');
                          }}
                        >
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="group-rides-create"
            onClick={handleCreate}
            disabled={!draft.title.trim() || createState === 'saving'}
          >
            <FiPlus size={14} />
            {createState === 'saving' ? t('route.groupRides.creating') : t('route.groupRides.create')}
          </button>
        </div>
      )}

      <div className="group-rides-list">
        {loading && <div className="group-rides-empty">{t('route.groupRides.loading')}</div>}
        {!loading && !filteredSortedRides.length && (
          <div className="group-rides-empty">
            {rides.length ? t('route.groupRides.filters.empty') : t('route.groupRides.empty')}
          </div>
        )}
        {!loading && filteredSortedRides.map((ride) => {
          const rideDate = formatRideDate(ride.startAt);
          const comments = Array.isArray(ride.comments) ? ride.comments : [];
          const isCommentsOpen = commentsOpen.has(ride.id);
          const instagramUrl = String(ride.instagramUrl || '').trim();
          const instagramEmbedUrl = getInstagramEmbedUrl(instagramUrl);
          return (
            <article key={ride.id} className="group-ride-card">
              <div
                className={`group-ride-cover${ride.photoUrl ? '' : ' group-ride-cover-fallback'} ride-challenge-${ride.challenge || 'social'}`}
                style={ride.photoUrl ? { backgroundImage: `url(${ride.photoUrl})` } : undefined}
              >
                <span className="ride-challenge-badge">
                  {t(`route.groupRides.challenges.${ride.challenge || 'social'}`)}
                </span>
              </div>

              {editingRideId === ride.id ? (
                <div className="group-ride-edit-form">
                  <input
                    type="text"
                    value={editDraft.title}
                    onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder={t('route.groupRides.fields.title')}
                    maxLength={120}
                    autoFocus
                  />
                  <textarea
                    value={editDraft.description}
                    onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder={t('route.groupRides.fields.description')}
                    rows={3}
                    maxLength={1200}
                  />
                  <div className="group-rides-form-row">
                    <label>
                      <FiFlag size={12} />
                      <select
                        value={editDraft.challenge}
                        onChange={(e) => setEditDraft((d) => ({ ...d, challenge: e.target.value }))}
                      >
                        {CHALLENGES.map((c) => (
                          <option key={c} value={c}>{t(`route.groupRides.challenges.${c}`)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <FiInstagram size={12} />
                      <input
                        type="url"
                        value={editDraft.instagramUrl}
                        onChange={(e) => setEditDraft((d) => ({ ...d, instagramUrl: e.target.value }))}
                        placeholder={t('route.groupRides.fields.instagramUrl')}
                      />
                    </label>
                  </div>
                  <div className="group-rides-form-row">
                    <label>
                      <FiMapPin size={12} />
                      <input
                        type="text"
                        value={editDraft.meetingPoint}
                        onChange={(e) => setEditDraft((d) => ({ ...d, meetingPoint: e.target.value }))}
                        placeholder={t('route.groupRides.fields.meetingPoint')}
                        maxLength={240}
                      />
                    </label>
                    <label>
                      <FiClock size={12} />
                      <input
                        type="datetime-local"
                        value={editDraft.startAt}
                        onChange={(e) => setEditDraft((d) => ({ ...d, startAt: e.target.value }))}
                      />
                    </label>
                    <label>
                      <FiGlobe size={12} />
                      <select
                        value={editDraft.visibility}
                        onChange={(e) => setEditDraft((d) => ({ ...d, visibility: e.target.value }))}
                      >
                        <option value="public">{t('route.groupRides.visibility.public')}</option>
                        <option value="private">{t('route.groupRides.visibility.private')}</option>
                      </select>
                    </label>
                  </div>
                  {ownRoutes.length > 0 && (
                    <div className="group-rides-form-route-picker">
                      {editDraft.routeId ? (
                        <div className="ride-route-picker-selected">
                          <FiMap size={11} />
                          <span>{editDraft.routeName}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditDraft((d) => ({ ...d, routeId: '', routeOwnerSub: '', routeName: '' }));
                              setEditRoutePickerQuery('');
                            }}
                          >
                            <FiX size={11} />
                          </button>
                        </div>
                      ) : (
                        <div className="ride-route-picker-search">
                          <FiSearch size={11} />
                          <input
                            type="search"
                            value={editRoutePickerQuery}
                            onChange={(e) => setEditRoutePickerQuery(e.target.value)}
                            placeholder={t('route.groupRides.fields.linkedRoute')}
                          />
                          {filteredEditPickerRoutes.length > 0 && (
                            <div className="ride-route-picker-list">
                              {filteredEditPickerRoutes.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => {
                                    setEditDraft((d) => ({ ...d, routeId: r.id, routeOwnerSub: r.ownerSub || '', routeName: r.name || '' }));
                                    setEditRoutePickerQuery('');
                                  }}
                                >
                                  {r.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="group-ride-edit-actions">
                    <button
                      type="button"
                      className="group-rides-create"
                      onClick={() => handleEdit(ride.id)}
                      disabled={!editDraft.title?.trim() || editState === 'saving'}
                    >
                      <FiCheck size={13} />
                      {editState === 'saving' ? t('route.groupRides.editing') : t('route.groupRides.editSave')}
                    </button>
                    <button type="button" className="ride-edit-cancel" onClick={cancelEdit}>
                      <FiX size={13} />
                      {t('route.groupRides.editCancel')}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="group-ride-body">
                <h4>{ride.title}</h4>

                {(rideDate || ride.meetingPoint) && (
                  <div className="group-ride-info">
                    {rideDate && <span><FiClock size={10} />{rideDate}</span>}
                    {ride.meetingPoint && <span><FiMapPin size={10} />{ride.meetingPoint}</span>}
                  </div>
                )}

                {ride.routeId && (
                  <button
                    type="button"
                    className="ride-route-strip"
                    onClick={() => {
                      loadSavedRoute(token, ride.routeId, ride.routeOwnerSub);
                      window.dispatchEvent(new CustomEvent('routeshred:set-tab', { detail: { tab: 'plan' } }));
                    }}
                  >
                    <FiMap size={12} />
                    <span>{ride.routeName || t('route.groupRides.loadRoute')}</span>
                    <FiArrowRight size={12} />
                  </button>
                )}

                {ride.description && <p className="group-ride-desc">{ride.description}</p>}

                {instagramUrl && (
                  <div className="group-ride-instagram">
                    {instagramEmbedUrl && (
                      <iframe
                        src={instagramEmbedUrl}
                        title={`${ride.title || t('route.groupRides.title')} Instagram`}
                        loading="lazy"
                        allowTransparency="true"
                      />
                    )}
                    <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
                      <FiInstagram size={12} />
                      {t('route.groupRides.instagramOpen')}
                    </a>
                  </div>
                )}

                <div className="group-ride-footer">
                  <button
                    type="button"
                    className={`ride-join-btn${ride.isJoined ? ' is-joined' : ''}`}
                    onClick={() => handleJoinToggle(ride)}
                    disabled={!token}
                  >
                    {ride.isJoined ? t('route.groupRides.leave') : t('route.groupRides.join')}
                  </button>
                  <span className="ride-rider-count">
                    <FiUsers size={11} />{Number(ride.participantsCount || 0)}
                  </span>
                  <div className="ride-share-actions">
                    <button type="button" onClick={() => handleShare(ride, 'whatsapp')} title="WhatsApp">
                      WA
                    </button>
                    <button type="button" onClick={() => handleShare(ride, 'copy')} title={t('route.groupRides.share.copy')}>
                      <FiShare2 size={12} />
                    </button>
                  </div>
                </div>

                {comments.length > 0 && (
                  <button type="button" className="ride-comments-toggle" onClick={() => toggleComments(ride.id)}>
                    <FiMessageSquare size={11} />
                    {comments.length} {comments.length === 1 ? 'Kommentar' : 'Kommentare'}
                  </button>
                )}

                {isCommentsOpen && (
                  <div className="group-ride-comments">
                    {comments.slice(-4).map((comment) => (
                      <div key={comment.id} className="group-ride-comment-item">
                        <strong>{comment.authorName}</strong>
                        <p>{comment.text}</p>
                      </div>
                    ))}
                    <div className="group-ride-comment-form">
                      <input
                        type="text"
                        value={commentDrafts[`${ride.ownerSub}:${ride.id}`] || ''}
                        onChange={(event) => {
                          const key = `${ride.ownerSub}:${ride.id}`;
                          setCommentDrafts((current) => ({ ...current, [key]: event.target.value }));
                        }}
                        placeholder={t('route.groupRides.commentPlaceholder')}
                        maxLength={500}
                        disabled={!token}
                      />
                      <button type="button" onClick={() => handleAddComment(ride)} disabled={!token}>
                        {t('route.groupRides.commentAction')}
                      </button>
                    </div>
                  </div>
                )}

                {ride.canEdit && (
                  <div className="group-ride-owner-actions">
                    <button type="button" className="ride-action-edit" onClick={() => startEdit(ride)}>
                      <FiEdit2 size={12} />
                      {t('route.groupRides.edit')}
                    </button>
                    <button type="button" className="ride-action-delete" onClick={() => handleDelete(ride.id)}>
                      <FiTrash2 size={12} />
                      {t('route.groupRides.delete')}
                    </button>
                  </div>
                )}
              </div>
              )}
            </article>
          );
        })}
      </div>

      {shareFeedback && <small className="group-rides-share-feedback">{shareFeedback}</small>}
      {error && <small className="group-rides-error">{error}</small>}
    </section>
  );
}

export default GroupRidesPanel;
