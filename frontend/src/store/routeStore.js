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
  setStartPoint: (point, label = '') => set({ startPoint: point, startLabel: label, route: null }),
  setEndPoint: (point, label = '') => set({ endPoint: point, endLabel: label, route: null }),
  addWaypoint: (point = null, label = '') => set((state) => ({
    waypoints: [
      ...state.waypoints,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, point, label }
    ],
    route: null
  })),
  updateWaypoint: (id, point, label = '') => set((state) => ({
    waypoints: state.waypoints.map((waypoint) => (
      waypoint.id === id ? { ...waypoint, point, label } : waypoint
    )),
    route: null
  })),
  removeWaypoint: (id) => set((state) => ({
    waypoints: state.waypoints.filter((waypoint) => waypoint.id !== id),
    route: null
  })),
  setRideType: async (type) => {
    const { rideType, startPoint, endPoint, loading } = get();
    if (rideType === type) return;
    set({ rideType: type });
    if (startPoint && endPoint && !loading) await get().calculateRoute();
  },
  setRiderProfile: async (profile) => {
    const { startPoint, endPoint, loading } = get();
    set({ riderProfile: { ...get().riderProfile, ...profile } });
    if (startPoint && endPoint && !loading) {
      await get().calculateRoute();
    }
  },
  setBikeType: async (type) => {
    const { bikeType, startPoint, endPoint, loading } = get();
    if (bikeType === type) {
      return;
    }

    set({ bikeType: type });

    if (startPoint && endPoint && !loading) {
      await get().calculateRoute();
    }
  },
  setPreference: async (pref) => {
    const { preference, startPoint, endPoint, loading } = get();
    if (preference === pref) {
      return;
    }

    set({ preference: pref });

    if (startPoint && endPoint && !loading) {
      await get().calculateRoute();
    }
  },
  resetRoute: () => set({
    route: null,
    startPoint: null,
    startLabel: '',
    endPoint: null,
    endLabel: '',
    waypoints: [],
    loading: false,
    error: null
  }),

  calculateRoute: async () => {
    const { startPoint, endPoint, bikeType, preference, rideType, riderProfile, waypoints } = get();

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
      const response = await axios.post(`${API_BASE}/routing/route`, {
        start: startPoint,
        end: endPoint,
        waypoints: waypoints.map((waypoint) => waypoint.point).filter(Boolean),
        bikeType: selectedBikeType,
        preference,
        rideType,
        riderProfile
      });

      set({ route: response.data, loading: false });
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
