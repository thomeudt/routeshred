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
