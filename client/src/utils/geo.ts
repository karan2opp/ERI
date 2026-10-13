import { reverseGeocodeApi, geocodeAddressApi } from '../services/api';

/**
 * Calculate distance in meters between two GPS coordinates using Haversine formula
 */
export const getDistanceInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Radius of Earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

/**
 * Format metres for people: "85 m", "1.4 km"
 */
export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
};

/** Walking minutes at about 80 m a minute (never less than 1). */
export const walkMinutes = (meters: number): number => Math.max(1, Math.round(meters / 80));

/**
 * Fetch human-readable address from coordinates (using Google Maps API backend proxy with OSM fallback)
 */
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  try {
    const res = await reverseGeocodeApi(lat, lng);
    if (res.success && res.data && res.data.address) {
      return res.data.address;
    }
  } catch (err) {
    console.warn('Backend reverse geocode notice, attempting fallback:', err);
  }

  // OpenStreetMap Nominatim Fallback
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    
    const data = await res.json();
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (err) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
};

/**
 * Geocode a search query to get coordinates (using Google Maps API backend proxy with OSM fallback)
 */
export const geocodeLocation = async (query: string): Promise<{ lat: number, lng: number } | null> => {
  try {
    const res = await geocodeAddressApi(query);
    if (res.success && res.data) {
      return { lat: res.data.lat, lng: res.data.lng };
    }
  } catch (err) {
    console.warn('Backend geocode address notice, attempting fallback:', err);
  }

  // OpenStreetMap Nominatim Fallback
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch (err) {
    return null;
  }
};
