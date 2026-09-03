export async function getLocationName(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
  );

  const data = await res.json();

  return (
    data.address?.road ||
    data.address?.suburb ||
    data.address?.city ||
    data.display_name
  );
}