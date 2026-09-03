const API_KEY = "c516daac26e6f2bff54d42267582a6ce";

export async function getWeather(lat, lng) {
  const currentRes = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
  );

  const forecastRes = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
  );

  if (!currentRes.ok || !forecastRes.ok) {
    throw new Error("Failed to fetch weather");
  }

  const current = await currentRes.json();
  const forecast = await forecastRes.json();

  return {
    current,
    forecast: forecast.list,
  };
}