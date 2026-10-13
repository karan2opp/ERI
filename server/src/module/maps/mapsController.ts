import { Request, Response } from 'express';
import { env } from '../../common/config/env';

const getApiKey = (): string => env.GOOGLE_MAP_API || '';

const MAX_QUERY_LENGTH = 200;

export const searchPlaces = async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > MAX_QUERY_LENGTH) {
      return res.status(200).json({ success: true, data: [] });
    }

    const apiKey = getApiKey();

    if (apiKey) {
      // 1. Try Google Places API (New)
      try {
        const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
          },
          body: JSON.stringify({ textQuery: query })
        });

        if (placesRes.ok) {
          const placesData: any = await placesRes.json();
          if (placesData.places && placesData.places.length > 0) {
            const results = placesData.places.map((place: any) => ({
              id: place.id,
              name: place.displayName?.text || place.formattedAddress?.split(',')[0] || query,
              address: place.formattedAddress || '',
              lat: place.location?.latitude,
              lng: place.location?.longitude,
              source: 'google'
            }));
            return res.status(200).json({ success: true, data: results });
          }
        }
      } catch (err) {
        console.warn('Google Places API (New) notice:', err);
      }

      // 2. Fallback to Google Geocoding API if Places returned empty
      try {
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
        );
        if (geoRes.ok) {
          const geoData: any = await geoRes.json();
          if (geoData.status === 'OK' && geoData.results && geoData.results.length > 0) {
            const results = geoData.results.slice(0, 5).map((item: any, idx: number) => ({
              id: item.place_id || `geo-${idx}`,
              name: item.formatted_address.split(',')[0],
              address: item.formatted_address,
              lat: item.geometry.location.lat,
              lng: item.geometry.location.lng,
              source: 'google'
            }));
            return res.status(200).json({ success: true, data: results });
          }
        }
      } catch (err) {
        console.warn('Google Geocoding API notice:', err);
      }
    }

    // 3. OpenStreetMap Nominatim Fallback
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PlanTree-App' } }
    );
    if (osmRes.ok) {
      const osmData: any = await osmRes.json();
      const results = osmData.map((item: any) => ({
        id: `osm-${item.place_id}`,
        name: item.display_name.split(',')[0],
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        source: 'osm'
      }));
      return res.status(200).json({ success: true, data: results });
    }

    return res.status(200).json({ success: true, data: [] });
  } catch (error) {
    console.error('Error in searchPlaces:', error);
    return res.status(500).json({ success: false, error: 'Failed to search places' });
  }
};

export const reverseGeocode = async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    const apiKey = getApiKey();

    if (apiKey) {
      try {
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
        );
        if (geoRes.ok) {
          const geoData: any = await geoRes.json();
          if (geoData.status === 'OK' && geoData.results && geoData.results.length > 0) {
            const first = geoData.results[0];
            return res.status(200).json({
              success: true,
              data: {
                address: first.formatted_address,
                placeId: first.place_id,
                source: 'google'
              }
            });
          }
        }
      } catch (err) {
        console.warn('Google Reverse Geocoding notice:', err);
      }
    }

    // Nominatim fallback
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PlanTree-App' } }
    );
    if (osmRes.ok) {
      const osmData: any = await osmRes.json();
      return res.status(200).json({
        success: true,
        data: {
          address: osmData.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          placeId: `osm-${osmData.place_id}`,
          source: 'osm'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: { address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, source: 'coords' }
    });
  } catch (error) {
    console.error('Error in reverseGeocode:', error);
    return res.status(500).json({ success: false, error: 'Failed to reverse geocode' });
  }
};

export const geocodeAddress = async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ success: false, error: 'Query parameter required (max 200 characters)' });
    }

    const apiKey = getApiKey();

    if (apiKey) {
      try {
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
        );
        if (geoRes.ok) {
          const geoData: any = await geoRes.json();
          if (geoData.status === 'OK' && geoData.results && geoData.results.length > 0) {
            const loc = geoData.results[0].geometry.location;
            return res.status(200).json({
              success: true,
              data: {
                lat: loc.lat,
                lng: loc.lng,
                formattedAddress: geoData.results[0].formatted_address,
                source: 'google'
              }
            });
          }
        }
      } catch (err) {
        console.warn('Google Geocode Address notice:', err);
      }
    }

    // Nominatim Fallback
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'PlanTree-App' } }
    );
    if (osmRes.ok) {
      const osmData: any = await osmRes.json();
      if (osmData && osmData.length > 0) {
        return res.status(200).json({
          success: true,
          data: {
            lat: parseFloat(osmData[0].lat),
            lng: parseFloat(osmData[0].lon),
            formattedAddress: osmData[0].display_name,
            source: 'osm'
          }
        });
      }
    }

    return res.status(404).json({ success: false, error: 'Address not found' });
  } catch (error) {
    console.error('Error in geocodeAddress:', error);
    return res.status(500).json({ success: false, error: 'Failed to geocode address' });
  }
};
