import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FiCamera, FiFlag, FiPlus, FiShare2, FiTrash2, FiUsers } from 'react-icons/fi';
import { useAuth } from '../auth/AuthProvider';
import { t } from '../i18n';

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

function GroupRidesPanel() {
  const { token } = useAuth();
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
  const [commentDrafts, setCommentDrafts] = useState({});
  const [shareFeedback, setShareFeedback] = useState('');
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    challenge: 'social',
    photoUrl: '',
    meetingPoint: '',
    startAt: '',
    visibility: 'public'
  });

  const sortedRides = useMemo(
    () => [...rides].sort((a, b) => String(b.startAt || b.updatedAt || '').localeCompare(String(a.startAt || a.updatedAt || ''))),
    [rides]
  );

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
        photoUrl: '',
        meetingPoint: '',
        startAt: '',
        visibility: draft.visibility
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
              <FiCamera size={12} />
              <input
                type="url"
                placeholder={t('route.groupRides.fields.photoUrl')}
                value={draft.photoUrl}
                onChange={(event) => setDraft((current) => ({ ...current, photoUrl: event.target.value }))}
              />
            </label>
          </div>
          <div className="group-rides-form-row">
            <input
              type="text"
              placeholder={t('route.groupRides.fields.meetingPoint')}
              value={draft.meetingPoint}
              onChange={(event) => setDraft((current) => ({ ...current, meetingPoint: event.target.value }))}
              maxLength={240}
            />
            <input
              type="datetime-local"
              value={draft.startAt}
              onChange={(event) => setDraft((current) => ({ ...current, startAt: event.target.value }))}
            />
            <select
              value={draft.visibility}
              onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value }))}
            >
              <option value="public">{t('route.groupRides.visibility.public')}</option>
              <option value="private">{t('route.groupRides.visibility.private')}</option>
            </select>
          </div>

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
        {!loading && !sortedRides.length && <div className="group-rides-empty">{t('route.groupRides.empty')}</div>}
        {!loading && sortedRides.map((ride) => (
          <article key={ride.id} className="group-ride-card">
            {ride.photoUrl ? (
              <div className="group-ride-photo" style={{ backgroundImage: `url(${ride.photoUrl})` }} />
            ) : (
              <div className="group-ride-photo group-ride-photo-fallback" />
            )}
            <div className="group-ride-body">
              <div className="group-ride-title-row">
                <h4>{ride.title}</h4>
                {ride.canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(ride.id)}
                    aria-label={t('route.groupRides.delete')}
                    title={t('route.groupRides.delete')}
                  >
                    <FiTrash2 size={14} />
                  </button>
                )}
              </div>
              <p>{ride.description || t('route.groupRides.noDescription')}</p>
              <div className="group-ride-actions">
                <button type="button" onClick={() => handleJoinToggle(ride)} disabled={!token}>
                  {ride.isJoined ? t('route.groupRides.leave') : t('route.groupRides.join')}
                </button>
                <span>{t('route.groupRides.participants', { count: Number(ride.participantsCount || 0) })}</span>
              </div>
              <div className="group-ride-share-row">
                <button type="button" onClick={() => handleShare(ride, 'instagram')}>
                  <FiShare2 size={12} /> Instagram
                </button>
                <button type="button" onClick={() => handleShare(ride, 'whatsapp')}>WhatsApp</button>
                <button type="button" onClick={() => handleShare(ride, 'telegram')}>Telegram</button>
                <button type="button" onClick={() => handleShare(ride, 'copy')}>{t('route.groupRides.share.copy')}</button>
              </div>
              <div className="group-ride-meta">
                <span>{t(`route.groupRides.challenges.${ride.challenge || 'social'}`)}</span>
                {ride.startAt && <span>{new Date(ride.startAt).toLocaleString()}</span>}
                {ride.meetingPoint && <span>{ride.meetingPoint}</span>}
                <span>{ride.visibility === 'public' ? t('route.groupRides.visibility.public') : t('route.groupRides.visibility.private')}</span>
              </div>
              {!!ride.participants?.length && (
                <div className="group-ride-participants">
                  {ride.participants.slice(0, 6).map((entry) => (
                    <span key={entry.sub}>{entry.name}</span>
                  ))}
                </div>
              )}
              <div className="group-ride-comments">
                {(Array.isArray(ride.comments) ? ride.comments : []).slice(-4).map((comment) => (
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
                      const value = event.target.value;
                      setCommentDrafts((current) => ({ ...current, [key]: value }));
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
            </div>
          </article>
        ))}
      </div>

      {shareFeedback && <small className="group-rides-share-feedback">{shareFeedback}</small>}
      {error && <small className="group-rides-error">{error}</small>}
    </section>
  );
}

export default GroupRidesPanel;
