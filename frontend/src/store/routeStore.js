import create from 'zustand';
import axios from 'axios';
import { t } from '../i18n';

const rawApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';

export const useRouteStore = create((set, get) => ({
  // State
  route: null,
  returnRoute: null,
  startPoint: null,
  startLabel: '',
  endPoint: null,
  endLabel: '',
  waypoints: [],
  bikeProfiles: [],
  bikeType: null,
  preference: 'scenic',
  rideType: 'z2',
  riderProfile: { ftp: 250, weight: 87 },
  includeReturnTrip: false,
  savedRoutes: [],
  savedRoutesLoading: false,
  savedRoutesError: null,
  activeSavedRouteId: null,
  routeSaveState: 'idle',
  loading: false,
  error: null,

  // Actions
  loadBikeProfiles: async () => {
    try {
      const response = await axios.get(`${API_BASE}/routing/profiles`);
      const profiles = Array.isArray(response.data?.profiles) ? response.data.profiles : [];
      set((state) => ({
        bikeProfiles: profiles,
        bikeType: state.bikeType || profiles[0]?.id || 'road'
      }));
    } catch (error) {
      const fallbackProfiles = [
        { id: 'road', label: 'Road', kind: 'road', source: 'fallback' },
        { id: 'gravel', label: 'Gravel', kind: 'gravel', source: 'fallback' },
        { id: 'mtb', label: 'MTB', kind: 'mtb', source: 'fallback' }
      ];
      set((state) => ({
        bikeProfiles: fallbackProfiles,
        bikeType: state.bikeType || fallbackProfiles[0].id
      }));
    }
  },
  setStartPoint: async (point, label = '') => {
    set({ startPoint: point, startLabel: label, route: null, returnRoute: null });
  },
  setEndPoint: async (point, label = '') => {
    set({ endPoint: point, endLabel: label, route: null, returnRoute: null });
  },
  addWaypoint: async (point = null, label = '') => {
    set((state) => ({
      waypoints: [
        ...state.waypoints,
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, point, label }
      ],
      route: null,
      returnRoute: null
    }));
  },
  insertWaypoint: async (point = null, label = '', atIndex = null) => {
    set((state) => {
      const nextWaypoint = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, point, label };
      const waypoints = [...state.waypoints];
      const idx = Number.isInteger(atIndex)
        ? Math.max(0, Math.min(atIndex, waypoints.length))
        : waypoints.length;
      waypoints.splice(idx, 0, nextWaypoint);
      return { waypoints, route: null, returnRoute: null };
    });
  },
  updateWaypoint: async (id, point, label = '') => {
    set((state) => ({
      waypoints: state.waypoints.map((waypoint) => (
        waypoint.id === id ? { ...waypoint, point, label } : waypoint
      )),
      route: null,
      returnRoute: null
    }));
  },
  removeWaypoint: async (id) => {
    set((state) => ({
      waypoints: state.waypoints.filter((waypoint) => waypoint.id !== id),
      route: null,
      returnRoute: null
    }));
  },
  moveWaypoint: async (fromIndex, toIndex) => {
    set((state) => {
      const waypoints = [...state.waypoints];
      if (
        !Number.isInteger(fromIndex)
        || !Number.isInteger(toIndex)
        || fromIndex < 0
        || fromIndex >= waypoints.length
        || toIndex < 0
        || toIndex >= waypoints.length
        || fromIndex === toIndex
      ) {
        return state;
      }

      const [moved] = waypoints.splice(fromIndex, 1);
      waypoints.splice(toIndex, 0, moved);
      return { waypoints, route: null, returnRoute: null };
    });
  },
  setRideType: async (type) => {
    const { rideType } = get();
    if (rideType === type) return;
    set({ rideType: type, route: null, returnRoute: null });
  },
  setRiderProfile: async (profile) => {
    set({ riderProfile: { ...get().riderProfile, ...profile }, route: null, returnRoute: null });
  },
  setBikeType: async (type) => {
    const { bikeType } = get();
    if (bikeType === type) {
      return;
    }

    set({ bikeType: type, route: null, returnRoute: null });
  },
  setPreference: async (pref) => {
    const { preference } = get();
    if (preference === pref) {
      return;
    }

    set({ preference: pref, route: null, returnRoute: null });
  },
  resetRoute: () => set({
    route: null,
    returnRoute: null,
    startPoint: null,
    startLabel: '',
    endPoint: null,
    endLabel: '',
    waypoints: [],
    includeReturnTrip: false,
    activeSavedRouteId: null,
    loading: false,
    error: null
  }),

  setIncludeReturnTrip: async (enabled) => {
    const { includeReturnTrip } = get();
    if (includeReturnTrip === enabled) {
      return;
    }

    set({ includeReturnTrip: enabled, route: null, returnRoute: null });
  },

  reverseRoute: async () => {
    const { startPoint, endPoint, startLabel, endLabel } = get();
    set((state) => ({
      startPoint: endPoint,
      endPoint: startPoint,
      startLabel: endLabel,
      endLabel: startLabel,
      waypoints: [...state.waypoints].reverse(),
      route: null,
      returnRoute: null
    }));
  },

  calculateRoute: async () => {
    const {
      startPoint,
      endPoint,
      bikeType,
      preference,
      rideType,
      riderProfile,
      waypoints,
      includeReturnTrip
    } = get();

    if (!bikeType) {
      await get().loadBikeProfiles();
    }

    if (!startPoint || !endPoint) {
      set({ error: t('route.errors.missingPoints') });
      return;
    }

    set({ loading: true, error: null });

    try {
      const selectedBikeType = get().bikeType || 'road';
      const waypointPoints = waypoints.map((waypoint) => waypoint.point).filter(Boolean);
      const response = await axios.post(`${API_BASE}/routing/route`, {
        start: startPoint,
        end: endPoint,
        waypoints: waypointPoints,
        bikeType: selectedBikeType,
        preference,
        rideType,
        riderProfile
      });

      let returnRoute = null;
      if (includeReturnTrip) {
        const returnResponse = await axios.post(`${API_BASE}/routing/route`, {
          start: endPoint,
          end: startPoint,
          waypoints: [...waypointPoints].reverse(),
          bikeType: selectedBikeType,
          preference,
          rideType,
          riderProfile
        });
        returnRoute = returnResponse.data;
      }

      set({ route: response.data, returnRoute, loading: false });
    } catch (error) {
      set({
        error: error.response?.data?.message || t('route.errors.calculateFailed'),
        loading: false
      });
    }
  },

  loadSavedRoutes: async (token) => {
    if (!token) {
      set({ savedRoutes: [], savedRoutesLoading: false, savedRoutesError: null });
      return;
    }

    set({ savedRoutesLoading: true, savedRoutesError: null });
    try {
      const response = await axios.get(`${API_BASE}/routes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({
        savedRoutes: Array.isArray(response.data?.routes) ? response.data.routes : [],
        savedRoutesLoading: false
      });
    } catch (error) {
      set({
        savedRoutesLoading: false,
        savedRoutesError: error.response?.data?.message || t('route.saved.errors.loadFailed')
      });
    }
  },

  saveCurrentRoute: async (token, name = '') => {
    const state = get();
    if (!token || !state.route) {
      set({ routeSaveState: 'error', savedRoutesError: t('route.saved.errors.noRoute') });
      return;
    }

    const defaultName = [
      state.startLabel || t('route.start'),
      state.endLabel || t('route.end')
    ].filter(Boolean).join(' → ');

    set({ routeSaveState: 'saving', savedRoutesError: null });
    try {
      const payload = {
        id: state.activeSavedRouteId || undefined,
        name: name || defaultName,
        startPoint: state.startPoint,
        startLabel: state.startLabel,
        endPoint: state.endPoint,
        endLabel: state.endLabel,
        waypoints: state.waypoints,
        bikeType: state.bikeType,
        preference: state.preference,
        rideType: state.rideType,
        riderProfile: state.riderProfile,
        includeReturnTrip: state.includeReturnTrip,
        route: state.route,
        returnRoute: state.returnRoute
      };
      const endpoint = state.activeSavedRouteId
        ? axios.put(`${API_BASE}/routes/${state.activeSavedRouteId}`, payload, { headers: { Authorization: `Bearer ${token}` } })
        : axios.post(`${API_BASE}/routes`, payload, { headers: { Authorization: `Bearer ${token}` } });
      const response = await endpoint;
      const savedRoute = response.data?.route;
      set({ activeSavedRouteId: savedRoute?.id || state.activeSavedRouteId, routeSaveState: 'saved' });
      await get().loadSavedRoutes(token);
      setTimeout(() => {
        if (get().routeSaveState === 'saved') {
          set({ routeSaveState: 'idle' });
        }
      }, 1200);
    } catch (error) {
      set({
        routeSaveState: 'error',
        savedRoutesError: error.response?.data?.message || t('route.saved.errors.saveFailed')
      });
    }
  },

  loadSavedRoute: async (token, routeId) => {
    if (!token || !routeId) {
      return;
    }

    set({ savedRoutesLoading: true, savedRoutesError: null });
    try {
      const response = await axios.get(`${API_BASE}/routes/${routeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const savedRoute = response.data?.route;
      if (!savedRoute) {
        throw new Error(t('route.saved.errors.loadFailed'));
      }

      set({
        activeSavedRouteId: savedRoute.id,
        startPoint: savedRoute.startPoint,
        startLabel: savedRoute.startLabel || '',
        endPoint: savedRoute.endPoint,
        endLabel: savedRoute.endLabel || '',
        waypoints: Array.isArray(savedRoute.waypoints) ? savedRoute.waypoints : [],
        bikeType: savedRoute.bikeType,
        preference: savedRoute.preference,
        rideType: savedRoute.rideType,
        riderProfile: savedRoute.riderProfile || get().riderProfile,
        includeReturnTrip: Boolean(savedRoute.includeReturnTrip),
        route: savedRoute.route || null,
        returnRoute: savedRoute.returnRoute || null,
        savedRoutesLoading: false,
        error: null
      });
    } catch (error) {
      set({
        savedRoutesLoading: false,
        savedRoutesError: error.response?.data?.message || t('route.saved.errors.loadFailed')
      });
    }
  },

  deleteSavedRoute: async (token, routeId) => {
    if (!token || !routeId) {
      return;
    }

    set({ savedRoutesError: null });
    try {
      await axios.delete(`${API_BASE}/routes/${routeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set((state) => ({
        savedRoutes: state.savedRoutes.filter((savedRoute) => savedRoute.id !== routeId),
        activeSavedRouteId: state.activeSavedRouteId === routeId ? null : state.activeSavedRouteId
      }));
    } catch (error) {
      set({ savedRoutesError: error.response?.data?.message || t('route.saved.errors.deleteFailed') });
    }
  },

  renameSavedRoute: async (token, routeId, name) => {
    const cleanName = String(name || '').trim();
    if (!token || !routeId || !cleanName) {
      return;
    }

    set({ savedRoutesError: null });
    try {
      const response = await axios.patch(
        `${API_BASE}/routes/${routeId}`,
        { name: cleanName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const renamed = response.data?.route;
      set((state) => ({
        savedRoutes: state.savedRoutes.map((savedRoute) => (
          savedRoute.id === routeId
            ? {
              ...savedRoute,
              name: renamed?.name || cleanName,
              updatedAt: renamed?.updatedAt || new Date().toISOString()
            }
            : savedRoute
        ))
      }));
    } catch (error) {
      set({ savedRoutesError: error.response?.data?.message || t('route.saved.errors.renameFailed') });
    }
  },

  exportRoute: async (format) => {
    const { route } = get();

    if (!route) {
      set({ error: t('route.errors.noRouteToExport') });
      return;
    }

    try {
      const endpoint = format === 'tcx' ? 'export/tcx' : 'export/gpx';
      const response = await axios.post(
        `${API_BASE}/${endpoint}`,
        {
          route,
          name: `Route_${new Date().getTime()}`,
          description: `${get().bikeType} bike route`
        },
        { responseType: 'blob' }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `route.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      set({
        error: error.response?.data?.message || t('route.errors.exportFailed', { format: format.toUpperCase() })
      });
    }
  }
}));
